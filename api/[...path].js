// api/[...path].js

import fetch from 'node-fetch';

export default async function handler(req, res) {
  // 1) Extract the “catch-all” path segments out of req.query.path
  //    e.g. if client calls /api/https://maps.googleapis.com/…,
  //    then pathParts = ['https:', '', 'maps.googleapis.com', 'maps', …]
  const pathParts = req.query.path || [];
  // Reconstruct the full target URL
  const targetUrl = pathParts.join('/');

  if (!targetUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Invalid target URL' });
  }

  try {
    // 2) Forward the incoming request’s method, headers, and body to targetUrl
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: {
        // Copy most headers (but do not forward Host or Origin)
        ...Object.fromEntries(
          Object.entries(req.headers).filter(([key]) => {
            return !['host', 'origin', 'referer', 'cookie'].includes(key.toLowerCase());
          })
        ),
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    });

    // 3) Copy upstream headers (except for CORS) into our response
    upstreamRes.headers.forEach((value, name) => {
      if (
        !['access-control-allow-origin', 'access-control-expose-headers'].includes(
          name.toLowerCase()
        )
      ) {
        res.setHeader(name, value);
      }
    });

    // 4) Always add CORS allow header
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept'
    );

    // 5) If it’s a preflight OPTIONS request, return immediately
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    // 6) Pipe the upstream response body back to the client
    const buffer = await upstreamRes.arrayBuffer();
    res.status(upstreamRes.status).send(Buffer.from(buffer));
  } catch (e) {
    console.error('Proxy error:', e);
    res.status(502).json({ error: 'Bad Gateway', details: e.toString() });
  }
}
