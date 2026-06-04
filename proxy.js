import http from 'http';
import httpProxy from 'http-proxy';

// Create a proxy server with custom application logic
const proxy = httpProxy.createProxyServer({});

const server = http.createServer((req, res) => {
  // Forward all requests to the backend server on port 22006
  proxy.web(req, res, { target: 'http://localhost:22006' }, (err) => {
    res.writeHead(502);
    res.end('Bad Gateway');
  });
});

server.listen(80, () => {
  console.log('✅ Reverse Proxy is listening on port 80 and forwarding to 22006!');
  console.log('You can now use Cloudflare to securely connect to this server.');
});
