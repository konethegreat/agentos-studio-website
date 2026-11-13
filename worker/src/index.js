import { latestRelease, pickAsset, publicManifest } from "./releases.js";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY"
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      ...CORS,
      ...SECURITY_HEADERS
    }
  });
}

function redirect(location, status = 302) {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      "Cache-Control": "public, max-age=300",
      ...SECURITY_HEADERS
    }
  });
}

const VERSION_SPAN = /(<[^>]*\bclass="[^"]*\bjs-version\b[^"]*"[^>]*>)[^<]*(<)/g;

/** Write the release version into every `.js-version` element, so the page is right before any
 * script runs and for link previews. Pure. */
export function stampVersion(html, version) {
  if (!version || !/^[0-9A-Za-z.+-]+$/.test(version)) return html;
  return html.replace(VERSION_SPAN, `$1${version}$2`);
}

const VIDEO_DIR = "/assets/video/";

/** Single byte range from a Range header, or null when the value is not one. */
function parseRange(value) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  return {
    start: match[1] === "" ? null : Number(match[1]),
    end: match[2] === "" ? null : Number(match[2])
  };
}

/** Resolve a parsed range against the file size. Null means the range starts past the end. */
function rangeBounds(range, size) {
  let { start, end } = range;
  if (start === null) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (end === null || end >= size) {
    end = size - 1;
  }
  if (end < start || start >= size) return null;
  return { start, end };
}

/** Workers static assets answer a Range request with the whole file, and the asset response
 * carries no Content-Length at the edge. Video needs 206 replies so the browser can seek, so
 * this handler reads the asset, then returns just the requested bytes. */
async function videoRange(request, env) {
  const headers = new Headers(request.headers);
  headers.delete("Range");
  const upstream = await env.ASSETS.fetch(new Request(request.url, { method: request.method, headers }));
  const type = upstream.headers.get("Content-Type") || "";
  if (
    request.method === "HEAD" ||
    upstream.status !== 200 ||
    !type.startsWith("video/") ||
    !upstream.body
  ) {
    return upstream;
  }

  const out = new Headers(upstream.headers);
  out.set("Accept-Ranges", "bytes");
  const whole = () => new Response(upstream.body, { status: 200, headers: out });

  const requested = request.headers.get("Range");
  if (!requested) return whole();

  const ifRange = request.headers.get("If-Range");
  if (ifRange && ifRange !== upstream.headers.get("ETag")) return whole();

  const range = parseRange(requested);
  if (!range) return whole();

  const buffer = await upstream.arrayBuffer();
  const size = buffer.byteLength;
  const bounds = rangeBounds(range, size);

  if (!bounds) {
    out.delete("Content-Length");
    out.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers: out });
  }

  out.set("Content-Range", `bytes ${bounds.start}-${bounds.end}/${size}`);
  out.set("Content-Length", String(bounds.end - bounds.start + 1));
  return new Response(buffer.slice(bounds.start, bounds.end + 1), { status: 206, headers: out });
}

async function page(request, env, ctx) {
  const res = await env.ASSETS.fetch(request);
  const type = res.headers.get("Content-Type") || "";
  if (request.method !== "GET" || !res.ok || !type.includes("text/html")) return res;
  const manifest = await latestRelease(ctx);
  const html = stampVersion(await res.text(), manifest && manifest.version);
  const headers = new Headers(res.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  headers.set("Cache-Control", "public, max-age=300");
  return new Response(html, { status: res.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
      return new Response(null, { status: 204, headers: { ...CORS, ...SECURITY_HEADERS } });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "Method not allowed", allow: "GET, HEAD" }, 405);
    }

    if (pathname.startsWith(VIDEO_DIR)) {
      return videoRange(request, env);
    }

    if (pathname === "/api/releases" || pathname === "/api/releases/") {
      const manifest = await latestRelease(ctx);
      return json(publicManifest(manifest));
    }

    if (pathname === "/download/latest" || pathname === "/download/latest/") {
      const manifest = await latestRelease(ctx);
      return redirect(manifest.page);
    }

    const flavorMatch = pathname.match(/^\/download\/([A-Za-z0-9-]+)\/?$/);
    if (flavorMatch) {
      const manifest = await latestRelease(ctx);
      const asset = pickAsset(manifest, flavorMatch[1]);
      if (asset) return redirect(asset.url);
      return redirect("/download/");
    }

    if (pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    return page(request, env, ctx);
  }
};
