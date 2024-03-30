const http = require('http');
const httpProxy = require('http-proxy');

// Define the target URL for the reverse proxy
const target = 'http://web.ton-rocket.com/trade';

// Create a proxy server instance
const proxy = httpProxy.createProxyServer({});

// Create a server to handle incoming requests
const server = http.createServer((req, res) => {
  // Log the incoming request
  console.log('Proxying request for:', req.url);

  // Proxy the request to the target URL
  proxy.web(req, res, { target });
});

// Listen on a specific port
const port = 3000;
server.listen(port, () => {
  console.log(`Reverse proxy server is running on port ${port}`);
});