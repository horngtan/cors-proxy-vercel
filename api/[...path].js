// api/[...path].js

import fetch from "node-fetch";

export default async function handler(req, res) {
  // 1) Grab the “catch‐all” path segments:
  //    e.g. if client calls:
  //      /api/https%3A%2F%2Fhttpbin.org%2Fget
  //    then `req.query.path = ["https%3A%2F%2Fhttpbin.org%2Fget"]`.
  const pathParts = req.query.path || [];
  // Re‐join them into one string:
  const encoded = pathParts.join("/"); 
  // Now decode it once, so that “%3A%2F%2F” → “://”
  const targetUrl = decodeURIComponent(encoded);

  console.log("→ raw segment(s):", pathParts);
  console.log("→ decoded targetUrl:", targetUrl);

  // 2) Make sure it really begins with “http”
  if (!targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "Invalid target URL" });
  }

  try {
    // 3) Forward the incoming request’s method, headers, and body to targetUrl
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: {
        // Copy all headers except Host, Origin, Referer, Cookie:
        ...Object.fromEntries(
          Object.entries(req.headers).filter(([key]) => {
            const lower = key.toLowerCase();
            return !["host", "origin", "referer", "cookie"].includes(lower);
          })
        ),
      },
      // If it’s GET/HEAD, omit body; otherwise forward the body:
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
    });

    // 4) Copy upstream response headers into ours (except CORS‐related)
    upstreamRes.headers.forEach((value, name) => {
      if (
        ![
          "access-control-allow-origin",
          "access-control-expose-headers",
        ].includes(name.toLowerCase())
      ) {
        res.setHeader(name, value);
      }
    });

    // 5) Always add permissive CORS headers:
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, Accept"
    );

    // 6) Short‐circuit for OPTIONS (preflight)
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    // 7) Pipe the upstream response body back to the client
    const buffer = await upstreamRes.arrayBuffer();
    return res.status(upstreamRes.status).send(Buffer.from(buffer));
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(502).json({ error: "Bad Gateway", details: `${err}` });
  }
}
