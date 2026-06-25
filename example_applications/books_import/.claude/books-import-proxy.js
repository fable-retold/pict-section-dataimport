// Tiny zero-dependency static + API-proxy server for verifying the books_import example.
// Serves books_import/dist/ at the root and forwards every /1.0/* request to the retold-harness on
// :8086 (same-origin, so the app's relative `/1.0/` URLPrefix + EntityProvider just work).
const libHTTP = require('http');
const libFS = require('fs');
const libPath = require('path');

const PORT = 9095;
const HARNESS_HOST = 'localhost';
const HARNESS_PORT = 8086;
const ROOT = libPath.join(__dirname, '..', 'dist');

const MIME = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
	'.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const server = libHTTP.createServer((pRequest, pResponse) =>
{
	const tmpURL = pRequest.url || '/';
	if (tmpURL.indexOf('/1.0/') === 0)
	{
		const tmpProxyRequest = libHTTP.request(
			{ host: HARNESS_HOST, port: HARNESS_PORT, method: pRequest.method, path: tmpURL, headers: pRequest.headers },
			(pProxyResponse) => { pResponse.writeHead(pProxyResponse.statusCode || 502, pProxyResponse.headers); pProxyResponse.pipe(pResponse); });
		tmpProxyRequest.on('error', (pError) => { pResponse.writeHead(502, { 'Content-Type': 'text/plain' }); pResponse.end(`Proxy error: ${pError.message}`); });
		pRequest.pipe(tmpProxyRequest);
		return;
	}
	let tmpRelative = decodeURIComponent(tmpURL.split('?')[0]);
	if (tmpRelative === '/') { tmpRelative = '/index.html'; }
	const tmpFilePath = libPath.join(ROOT, libPath.normalize(tmpRelative));
	if (tmpFilePath.indexOf(ROOT) !== 0) { pResponse.writeHead(403); return pResponse.end('Forbidden'); }
	libFS.readFile(tmpFilePath, (pError, pData) =>
	{
		if (pError) { pResponse.writeHead(404, { 'Content-Type': 'text/plain' }); return pResponse.end('Not found'); }
		pResponse.writeHead(200, { 'Content-Type': MIME[libPath.extname(tmpFilePath)] || 'application/octet-stream' });
		return pResponse.end(pData);
	});
});
server.listen(PORT, () => console.log(`books-import-proxy serving ${ROOT} on http://localhost:${PORT} (/1.0/* -> :${HARNESS_PORT})`));
