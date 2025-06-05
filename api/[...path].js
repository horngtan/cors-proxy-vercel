// api/[...path].js

import fetch from "node-fetch";

export default async function handler(req, res) {
  // 1) Grab the one catch-all segment (still percent-encoded once):
  //    e.g. req.query.path = ["https%3A%2F%2Fhttpbin.org%2Fget"]
  const pathParts = req.query.path || [];
  const raw       = pathParts.join("/"); 
  //            raw === "https%3A%2F%2Fhttpbin.org%2Fget"

  // 2) Decode exactly once:
  const targetUrl = decodeURIComponent(raw);
  //            targetUrl === "https://httpbin.org/get"

  console.log("→ raw segment:", raw);
  console.log("→ decoded URL:", targetUrl);

  // 3) Reject anything that does not start with "http"
  if (!targetUrl.startsWith("http")) {
    return res.status(400).json({ error: "Invalid target URL" });
  }

  try {
    // 4) Forward the request to the real target URL
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: {
        // Copy all incoming headers except Host, Origin, Referer, Cookie
        ...Object.fromEntries(
          Object.entries(req.headers).filter(([key]) => {
            const lower = key.toLowerCase();
            return !["host", "origin", "referer", "cookie"].includes(lower);
          })
        ),
      },
      // Only GET and HEAD omit the body; other methods forward the raw body
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
    });

    // 5) Copy upstream response headers (except existing CORS headers)
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

    // 6) Add permissive CORS headers ourselves
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, Accept"
    );

    // 7) If it’s a preflight OPTIONS, return immediately
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    // 8) Stream the upstream response body back to the client
    const buffer = await upstreamRes.arrayBuffer();
    return res.status(upstreamRes.status).send(Buffer.from(buffer));
  } catch (e) {
    console.error("Proxy error:", e);
    return res.status(502).json({ error: "Bad Gateway", details: e.toString() });
  }
}
