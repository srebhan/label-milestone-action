const http = require('http');

// A minimal stand-in for the GitHub REST API, covering just the three
// endpoints the action talks to. The runner swaps out `state` per test case
// and inspects `state.patches` afterwards to see what the action did.
function createMockApi(state) {
    return http.createServer((req, res) => {
        const path = new URL(req.url, 'http://localhost').pathname;
        const send = (code, body) => {
            res.writeHead(code, { 'content-type': 'application/json' });
            res.end(JSON.stringify(body));
        };

        state.requests.push({ method: req.method, path: path });

        // GET /repos/{owner}/{repo}/releases/latest
        if (req.method === 'GET' && /\/releases\/latest$/.test(path)) {
            if (state.latestRelease === null) {
                return send(404, { message: 'Not Found' });
            }
            return send(200, state.latestRelease);
        }

        // GET /repos/{owner}/{repo}/milestones
        if (req.method === 'GET' && /\/milestones$/.test(path)) {
            return send(200, state.milestones);
        }

        // PATCH /repos/{owner}/{repo}/issues/{number}
        if (req.method === 'PATCH' && /\/issues\/\d+$/.test(path)) {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
                state.patches.push({ path: path, body: JSON.parse(body || '{}') });
                send(200, { number: 1 });
            });
            return;
        }

        return send(404, { message: `unmocked endpoint: ${req.method} ${path}` });
    });
}

module.exports = { createMockApi };
