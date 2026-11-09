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

    if (pathname.startsWith("/download/") || pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    return env.ASSETS.fetch(request);
  }
};
