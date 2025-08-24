const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const metascraper = require('metascraper')([
  require('metascraper-author')(),
  require('metascraper-date')(),
  require('metascraper-description')(),
  require('metascraper-image')(),
  require('metascraper-logo')(),
  require('metascraper-publisher')(),
  require('metascraper-title')(),
  require('metascraper-url')(),
  require('metascraper-lang')()
]);
const got = require('got');
const cheerio = require('cheerio');
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();

// Environment Configuration
const config = {
  port: process.env.PORT || 3000,
  openaiApiKey: process.env.OPENAI_API_KEY,
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS) || 10000,
  maxRedirects: parseInt(process.env.MAX_REDIRECTS) || 5,
  defaultUserAgent: process.env.USER_AGENT || 'Mozilla/5.0 (compatible; MetascraperBot/1.0)',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  nodeEnv: process.env.NODE_ENV || 'development'
};

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: {
    status: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - Request received`);
  
  // Store start time for response logging
  req.startTime = Date.now();
  
  // Override res.json to log responses
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - req.startTime;
    const responseTimestamp = new Date().toISOString();
    console.log(`[${responseTimestamp}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
    return originalJson.call(this, data);
  };
  
  next();
});

app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(limiter);
app.use(express.json());

const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

const extractTextFromHtml = (html) => {
  const $ = cheerio.load(html);
  
  // Remove unnecessary elements
  $('script').remove();
  $('style').remove();
  $('nav').remove();
  $('footer').remove();
  $('aside').remove();
  $('.advertisement, .ads, .sidebar').remove();
  
  const titleContent = $('title').text().trim();
  const headings = $('h1, h2, h3').map((i, el) => $(el).text().trim()).get().join(' ');
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const textContent = $('body').text().replace(/\s+/g, ' ').trim();
  
  return {
    title: titleContent,
    headings: headings.substring(0, 500),
    metaDescription,
    content: textContent.substring(0, 2000)
  };
};

const enhanceMetadataWithGPT = async (url, textData, existingMetadata) => {
  if (!config.openaiApiKey || config.openaiApiKey === 'your_openai_api_key_here') {
    return existingMetadata;
  }

  // Only call GPT if description is missing
  if (existingMetadata.description) {
    return existingMetadata;
  }

  try {
    const prompt = `웹페이지 메타데이터 추출:

URL: ${url}
제목: ${textData.title}
주요 헤딩: ${textData.headings}
기존 메타 설명: ${textData.metaDescription}
본문 내용: ${textData.content}

현재 추출된 정보:
${JSON.stringify(existingMetadata, null, 2)}

부족한 다음 정보를 JSON 형태로만 응답해주세요 (다른 설명 없이):
{
  "description": "페이지 요약 (50-160자, 한국어 사이트면 한국어로)",
  "author": "작성자명 또는 null",
  "publisher": "발행처명 또는 null",
  "lang": "언어코드(ko/en/etc) 또는 null"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5-nano",
      messages: [{ role: "user", content: prompt }]
    });

    const responseText = completion.choices?.[0]?.message?.content || "";
    console.log(responseText);
    const gptResult = JSON.parse(responseText);
    
    // Merge with existing metadata, keeping existing values if they exist
    const enhanced = { ...existingMetadata };
    if (!enhanced.description && gptResult.description && gptResult.description !== 'null') {
      enhanced.description = gptResult.description;
    }
    if (!enhanced.author && gptResult.author && gptResult.author !== 'null') {
      enhanced.author = gptResult.author;
    }
    if (!enhanced.publisher && gptResult.publisher && gptResult.publisher !== 'null') {
      enhanced.publisher = gptResult.publisher;
    }
    if (!enhanced.lang && gptResult.lang && gptResult.lang !== 'null') {
      enhanced.lang = gptResult.lang;
    }
    
    return enhanced;
  } catch (error) {
    console.error('GPT enhancement failed:', error);
    return existingMetadata;
  }
};

app.get('/health', (req, res) => {
  res.json({ 
    status: true, 
    message: 'API is running',
    environment: config.nodeEnv,
    version: '1.0.0'
  });
});

app.get('/api/metadata', async (req, res) => {
  try {
    const { url, userAgent, timeout } = req.query;

    if (!url) {
      return res.status(400).json({
        status: false,
        message: 'URL parameter is required'
      });
    }

    if (!isValidUrl(url)) {
      return res.status(400).json({
        status: false,
        message: 'Invalid URL format'
      });
    }

    const headers = {
      'User-Agent': userAgent || config.defaultUserAgent
    };

    const { body: html } = await got(url, {
      headers,
      timeout: parseInt(timeout) || config.requestTimeoutMs,
      followRedirect: true,
      maxRedirects: config.maxRedirects
    });

    const metadata = await metascraper({ html, url });

    // Extract text content for GPT enhancement
    const textData = extractTextFromHtml(html);
    
    // Enhance metadata with GPT if fields are missing
    const enhancedMetadata = await enhanceMetadataWithGPT(url, textData, metadata);

    res.json({
      status: true,
      data: {
        lang: enhancedMetadata.lang || null,
        author: enhancedMetadata.author || null,
        title: enhancedMetadata.title || null,
        description: enhancedMetadata.description || null,
        publisher: enhancedMetadata.publisher || null,
        image: enhancedMetadata.image || null,
        logo: enhancedMetadata.logo || null,
        url: enhancedMetadata.url || url,
        date: enhancedMetadata.date || null
      }
    });

  } catch (error) {
    console.error('Error scraping metadata:', error);
    
    let statusCode = 500;
    let message = 'Internal server error';

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      statusCode = 408;
      message = 'Request timeout';
    } else if (error.response?.statusCode) {
      statusCode = error.response.statusCode;
      message = `HTTP ${error.response.statusCode} error`;
    } else if (error.code === 'ENOTFOUND') {
      statusCode = 404;
      message = 'Domain not found';
    }

    res.status(statusCode).json({
      status: false,
      message
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    status: false,
    message: 'Endpoint not found'
  });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Microlink API server running on http://0.0.0.0:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Health check: http://0.0.0.0:${config.port}/health`);
  console.log(`API endpoint: http://0.0.0.0:${config.port}/api/metadata?url=<target_url>`);
  
  if (config.nodeEnv === 'development') {
    console.log('Configuration loaded from environment variables');
    console.log(`Rate limit: ${config.rateLimitMaxRequests} requests per ${config.rateLimitWindowMs/1000/60} minutes`);
    console.log(`Request timeout: ${config.requestTimeoutMs}ms`);
  }
});
