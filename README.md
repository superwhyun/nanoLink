# Microlink API Clone

A web scraping service similar to api.microlink.io using metascraper. This API extracts metadata from web pages and provides it in a structured JSON format.

## Features

- Extract metadata from any web page (title, description, image, author, etc.)
- RESTful API with simple GET requests
- Rate limiting to prevent abuse
- CORS enabled for cross-origin requests
- Security middleware with Helmet.js
- Comprehensive error handling
- External access ready

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file (optional):
```
PORT=3000
```

4. Start the server:
```bash
npm start
```

The API will be available at `http://localhost:3000`

## API Endpoints

### GET /api/metadata

Extract metadata from a web page.

**Parameters:**
- `url` (required): The URL of the webpage to scrape
- `userAgent` (optional): Custom user agent string
- `timeout` (optional): Request timeout in milliseconds (default: 10000)

**Example Request:**
```
GET /api/metadata?url=https://example.com
```

**Example Response:**
```json
{
  "status": true,
  "data": {
    "lang": "en",
    "author": null,
    "title": "Example Domain",
    "description": "This domain is for use in illustrative examples in documents.",
    "publisher": null,
    "image": null,
    "logo": null,
    "url": "https://example.com",
    "date": null
  }
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": true,
  "message": "API is running"
}
```

## Usage Examples

### Basic Usage
```bash
curl "http://localhost:3000/api/metadata?url=https://github.com"
```

### With Custom User Agent
```bash
curl "http://localhost:3000/api/metadata?url=https://example.com&userAgent=MyBot/1.0"
```

### With Custom Timeout
```bash
curl "http://localhost:3000/api/metadata?url=https://slow-site.com&timeout=5000"
```

## Error Responses

The API returns appropriate HTTP status codes and error messages:

```json
{
  "status": false,
  "message": "Error description"
}
```

Common error codes:
- `400`: Bad Request (missing or invalid URL)
- `404`: Domain not found
- `408`: Request timeout
- `429`: Too many requests (rate limited)
- `500`: Internal server error

## Rate Limiting

The API implements rate limiting:
- 100 requests per 15 minutes per IP address
- Rate limit exceeded returns HTTP 429

## Deployment

The server is configured to listen on all interfaces (`0.0.0.0`) making it accessible externally. Set the `PORT` environment variable for custom port configuration.

For production deployment:
```bash
PORT=8080 npm start
```

## Supported Metadata Fields

The API extracts the following metadata fields:
- `title`: Page title
- `description`: Page description
- `image`: Main image URL
- `logo`: Site logo URL
- `author`: Content author
- `publisher`: Content publisher
- `date`: Publication date
- `lang`: Page language
- `url`: Canonical URL

## Dependencies

- Express.js: Web framework
- Metascraper: Metadata extraction
- Got: HTTP client for fetching pages
- Helmet: Security middleware
- CORS: Cross-origin resource sharing
- Express-rate-limit: Rate limiting