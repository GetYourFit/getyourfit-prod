import http from 'node:http';

// A stand-in for the parts of the Supabase Storage REST API the server uses. It rejects requests without the
// expected key, keeps a log of every request, and can be told to fail so outage behavior can be tested.
export async function startFakeStorage(t, { key = 'sb_secret_fake_test_key' } = {}) {
  const objects = new Map();
  const buckets = new Map();
  const log = [];
  const state = { failing: false };
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks);
      const { pathname } = new URL(request.url, 'http://fake');
      log.push({ method: request.method, path: decodeURIComponent(pathname) });
      const send = (status, value) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(value === undefined ? '' : JSON.stringify(value));
      };
      if (request.headers.apikey !== key) return send(401, { message: 'Invalid API key' });
      if (state.failing) return send(500, { message: 'down' });
      const path = decodeURIComponent(pathname);
      let match;
      if ((match = path.match(/^\/storage\/v1\/bucket\/([^/]+)$/)) && request.method === 'GET') {
        return buckets.has(match[1]) ? send(200, buckets.get(match[1])) : send(404, { message: 'Bucket not found' });
      }
      if (path === '/storage/v1/bucket' && request.method === 'POST') {
        const bucket = JSON.parse(body);
        buckets.set(bucket.id, bucket);
        return send(200, { name: bucket.name });
      }
      if ((match = path.match(/^\/storage\/v1\/object\/list\/([^/]+)$/)) && request.method === 'POST') {
        const { prefix } = JSON.parse(body);
        const names = [...objects.keys()].filter((name) => name.startsWith(`${match[1]}/${prefix}`)).map((name) => ({ name: name.slice(`${match[1]}/${prefix}`.length) }));
        return send(200, names);
      }
      if ((match = path.match(/^\/storage\/v1\/object\/([^/]+)$/)) && request.method === 'DELETE') {
        for (const object of JSON.parse(body).prefixes) objects.delete(`${match[1]}/${object}`);
        return send(200, []);
      }
      if ((match = path.match(/^\/storage\/v1\/object\/(.+)$/))) {
        if (request.method === 'POST') {
          if (objects.has(match[1])) return send(409, { message: 'Duplicate' });
          objects.set(match[1], body);
          return send(200, { Key: match[1] });
        }
        if (request.method === 'GET') {
          if (!objects.has(match[1])) return send(404, { message: 'Object not found' });
          response.writeHead(200, { 'Content-Type': 'image/jpeg' });
          return response.end(objects.get(match[1]));
        }
      }
      return send(400, { message: 'Unsupported' });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return { url: `http://127.0.0.1:${server.address().port}`, key, objects, buckets, log, state };
}
