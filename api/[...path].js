// api/[...path].js

import fetch from "node-fetch";

export default async function handler(req, res) {
  // 1) Grab the “catch‐all” path segments:
  //    e.g. if client calls …
  //      /api/https%3A%2F%2Fhttpbin.org%2Fget
  //    Then `req.query.path = ["https://httpbin.org/get"]`.
  const pathParts = req.query.path || [];
  const targetUrl = pathParts.join("/"); 
  //            targetUrl === "https://httpbin.org/get"

  console.log("→ targetUrl (after Vercel’s auto‐decode):", targetUrl);

  // 2) Reject anything not starting with "http"
  if (!targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "Invalid target URL" });
  }

  try {
    // 3) Forward the incoming request to the real target URL
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: {
        // copy all headers except Host, Origin, Referer, Cookie
        ...Object.fromEntries(
          Object.entries(req.headers).filter(([key]) => {
            const lower = key.toLowerCase();
            return !["host", "origin", "referer", "cookie"].includes(lower);
          })
        ),
      },
      // GET/HEAD omit the body; others forward req.body
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
    });

    // 4) Copy almost‐all upstream headers into our response
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

    // 5) Always add permissive CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, Accept"
    );

    // 6) If it’s a preflight OPTIONS, end immediately
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    // 7) Pipe the upstream response body back to the browser
    const buffer = await upstreamRes.arrayBuffer();
    return res.status(upstreamRes.status).send(Buffer.from(buffer));
  } catch (e) {
    console.error("Proxy error:", e);
    return res.status(502).json({ error: "Bad Gateway", details: e.toString() });
  }
}
