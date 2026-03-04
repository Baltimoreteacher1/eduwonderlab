/**
 * _worker.js — EduWonderLab Cloudflare Pages Worker
 *
 * KV Binding required (set in Cloudflare Dashboard):
 *   Variable name : EWL_DATA
 *   (Workers & Pages → your project → Settings → Functions → KV namespace bindings)
 *
 * Routes handled:
 *   GET  /api/health
 *
 *   GET  /api/assignments?limit=&offset=
 *   POST /api/assignments
 *   GET  /api/assignments/:id
 *
 *   GET  /api/submissions?assignmentId=&limit=&offset=
 *   POST /api/submissions
 *   GET  /api/submissions/:id
 *
 * Storage layout in KV:
 *   assignment:{id}   → JSON object
 *   submission:{id}   → JSON object
 *   index:assignments → JSON array of ids  (keeps list ordered)
 *   index:submissions → JSON array of ids
 */

const CORS = {
  "Access-Control-Allow-Origin": "*", // TODO: tighten for production
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function err(msg, status = 400) {
  return json({ ok: false, error: msg }, status);
}

function uid() {
  // compact random ID — fine for classroom scale
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)
  );
}

// Simple length guard to avoid oversized values in KV
function limitString(value, max = 4000) {
  const s = String(value || "");
  return s.length > max ? s.slice(0, max) : s;
}

// ---------- KV helpers ----------

async function kvGet(kv, key) {
  const v = await kv.get(key);
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

async function kvPut(kv, key, value) {
  await kv.put(key, JSON.stringify(value));
}

async function getIndex(kv, name) {
  return (await kvGet(kv, `index:${name}`)) || [];
}

async function pushIndex(kv, name, id) {
  const idx = await getIndex(kv, name);
  if (!idx.includes(id)) idx.push(id);
  await kvPut(kv, `index:${name}`, idx);
}

// Utility to apply naive offset/limit pagination to an array of ids
function sliceByQuery(ids, url) {
  const limit = parseInt(url.searchParams.get("limit") || "0", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  let start = Number.isFinite(offset) && offset > 0 ? offset : 0;
  let end =
    Number.isFinite(limit) && limit > 0 ? start + limit : ids.length;

  if (start < 0) start = 0;
  if (end < start) end = start;

  return ids.slice(start, end);
}

// Extract ID from routes like /api/assignments/:id
function extractId(path, prefix) {
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length); // everything after prefix
  if (!rest) return null;
  if (!rest.startsWith("/")) return null;
  const id = rest.slice(1);
  return id || null;
}

// ---------- Route handlers: Assignments ----------

async function handleAssignmentsList(kv, url) {
  const allIds = await getIndex(kv, "assignments");
  const ids = sliceByQuery(allIds, url);
  const items = await Promise.all(
    ids.map((id) => kvGet(kv, `assignment:${id}`))
  );

  // newest first from index order
  return json({
    ok: true,
    items: items.filter(Boolean).reverse(),
    total: allIds.length,
  });
}

async function handleAssignmentGetOne(kv, id) {
  const item = await kvGet(kv, `assignment:${id}`);
  if (!item) return err("assignment not found", 404);
  return json({ ok: true, item });
}

async function handleAssignmentsPost(kv, body) {
  const { title, prompt } = body || {};
  if (!title || !title.trim()) return err("title is required");
  if (!prompt || !prompt.trim()) return err("prompt is required");

  const recordTitle = limitString(title.trim(), 200);
  const recordPrompt = limitString(prompt.trim(), 8000);

  const id = uid();
  const record = {
    id,
    title: recordTitle,
    prompt: recordPrompt,
    gradeBand: limitString((body.gradeBand || "").trim(), 50),
    classPin: limitString((body.classPin || "").trim(), 50),
    createdAt: body.createdAt || new Date().toISOString(),
  };

  await kvPut(kv, `assignment:${id}`, record);
  await pushIndex(kv, "assignments", id);

  return json({ ok: true, id, item: record }, 201);
}

// ---------- Route handlers: Submissions ----------

async function handleSubmissionsList(kv, url) {
  const filterId = url.searchParams.get("assignmentId") || "";
  const allIds = await getIndex(kv, "submissions");
  const ids = sliceByQuery(allIds, url);

  let items = await Promise.all(
    ids.map((id) => kvGet(kv, `submission:${id}`))
  );
  items = items.filter(Boolean);

  if (filterId) {
    items = items.filter((s) => s.assignmentId === filterId);
  }

  return json({
    ok: true,
    items: items.reverse(), // newest first
    total: allIds.length,
  });
}

async function handleSubmissionGetOne(kv, id) {
  const item = await kvGet(kv, `submission:${id}`);
  if (!item) return err("submission not found", 404);
  return json({ ok: true, item });
}

async function handleSubmissionsPost(kv, body) {
  const { assignmentId, studentName, response } = body || {};
  if (!assignmentId) return err("assignmentId is required");
  if (!studentName || !studentName.trim()) {
    return err("studentName is required");
  }
  if (!response || !response.trim()) return err("response is required");

  // verify assignment exists
  const asgn = await kvGet(kv, `assignment:${assignmentId}`);
  if (!asgn) return err("assignment not found", 404);

  const id = uid();
  const record = {
    id,
    assignmentId,
    studentName: limitString(studentName.trim(), 200),
    classPin: limitString((body.classPin || "").trim(), 50),
    response: limitString(response.trim(), 12000),
    steps: limitString((body.steps || "").trim(), 8000),
    reflection: limitString((body.reflection || "").trim(), 8000),
    submittedAt: body.submittedAt || new Date().toISOString(),
  };

  await kvPut(kv, `submission:${id}`, record);
  await pushIndex(kv, "submissions", id);

  return json({ ok: true, id, item: record }, 201);
}

// ---------- Main fetch handler ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Health check
    if (path === "/api" || path === "/api/health") {
      return json({
        ok: true,
        service: "EduWonderLab API",
        ts: new Date().toISOString(),
      });
    }

    // All other /api/* routes need KV
    if (path.startsWith("/api/")) {
      const kv = env.EWL_DATA;

      if (!kv) {
        return err(
          "KV namespace EWL_DATA not bound. Go to Cloudflare Dashboard → " +
            "Workers & Pages → your project → Settings → Functions → " +
            "KV namespace bindings and add EWL_DATA.",
          500
        );
      }

      // TODO: hook for authentication / API key if needed

      // Parse JSON body for POST
      let body = null;
      if (method === "POST") {
        try {
          body = await request.json();
        } catch {
          return err("Invalid JSON body");
        }
      }

      // Assignments collection
      if (path === "/api/assignments") {
        if (method === "GET") return handleAssignmentsList(kv, url);
        if (method === "POST") return handleAssignmentsPost(kv, body);
      }

      // Assignment single
      const assignmentId = extractId(path, "/api/assignments");
      if (assignmentId && method === "GET") {
        return handleAssignmentGetOne(kv, assignmentId);
      }

      // Submissions collection
      if (path === "/api/submissions") {
        if (method === "GET") return handleSubmissionsList(kv, url);
        if (method === "POST") return handleSubmissionsPost(kv, body);
      }

      // Submission single
      const submissionId = extractId(path, "/api/submissions");
      if (submissionId && method === "GET") {
        return handleSubmissionGetOne(kv, submissionId);
      }

      return err("Not found", 404);
    }

    // Serve static assets for everything else
    return env.ASSETS.fetch(request);
  },
};
