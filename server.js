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
require('dotenv').config();

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

    res.json({
      status: true,
      data: {
        lang: metadata.lang || null,
        author: metadata.author || null,
        title: metadata.title || null,
        description: metadata.description || null,
        publisher: metadata.publisher || null,
        image: metadata.image || null,
        logo: metadata.logo || null,
        url: metadata.url || url,
        date: metadata.date || null
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