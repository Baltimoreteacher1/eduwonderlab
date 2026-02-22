export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health/API check endpoints
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      // Simple health check
      if (url.pathname === "/api" || url.pathname === "/api/health") {
        return new Response(
          JSON.stringify({
            ok: true,
            service: "EduWonderLab API",
            ts: new Date().toISOString(),
          }),
          { headers: { "Content-Type": "application/json; charset=utf-8" } }
        );
      }

      // Default API response for anything else under /api/*
      return new Response(
        JSON.stringify({ ok: true, path: url.pathname }),
        { headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    // IMPORTANT: serve static assets for all non-API routes
    return env.ASSETS.fetch(request);
  },
};