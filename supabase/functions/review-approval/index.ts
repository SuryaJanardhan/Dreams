const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const bucket = Deno.env.get("APPROVAL_BUCKET") ?? "videos";
const githubRepository = Deno.env.get("GITHUB_REPOSITORY") ?? "";
const githubToken = Deno.env.get("GITHUB_DISPATCH_TOKEN") ?? "";

const headers = {
  Authorization: `Bearer ${serviceKey}`,
  apikey: serviceKey,
  "Content-Type": "application/json",
};
const pageHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

type ReviewRow = {
  id: string;
  status: string;
  preview_key: string;
  expires_at: string;
  payload: { progress?: { task?: { idea?: string } } };
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function page(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#f7f7f4;color:#151515;font:16px/1.5 Arial,sans-serif}.wrap{max-width:720px;margin:32px auto;padding:24px}.card{background:#fff;border:1px solid #ddd;border-radius:14px;padding:24px;box-shadow:0 8px 30px #0000000c}video{display:block;width:min(100%,360px);max-height:640px;margin:20px auto;background:#111;border-radius:10px}.actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}.button{border:0;border-radius:8px;padding:14px 22px;color:#fff;font-weight:700;cursor:pointer}.approve{background:#3f8f62}.reject{background:#cf4e46}.yellow{height:6px;background:#e7c536;border-radius:8px;margin-bottom:18px}.muted{color:#666;font-size:14px}</style></head><body><main class="wrap"><div class="card"><div class="yellow"></div>${body}</div></main></body></html>`,
    { status, headers: pageHeaders },
  );
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function findPending(token: string): Promise<ReviewRow | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const hash = await sha256(token);
  const response = await fetch(
    `${supabaseUrl}/rest/v1/approval_requests?token_hash=eq.${hash}&status=eq.pending&select=id,status,preview_key,expires_at,payload&limit=1`,
    { headers },
  );
  if (!response.ok) throw new Error("Review lookup failed");
  const rows = (await response.json()) as ReviewRow[];
  return rows[0] ?? null;
}

async function signedPreview(key: string, expiresAt: string) {
  const remaining = Math.max(
    60,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ expiresIn: remaining }),
    },
  );
  if (!response.ok) throw new Error("Preview signing failed");
  const result = (await response.json()) as { signedURL: string };
  return new URL(result.signedURL, supabaseUrl).href;
}

async function dispatch(id: string) {
  if (!githubRepository || !githubToken)
    throw new Error("GitHub dispatch secret is not configured");
  const response = await fetch(
    `https://api.github.com/repos/${githubRepository}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: "approval-decision",
        client_payload: { approval_id: id },
      }),
    },
  );
  if (!response.ok)
    throw new Error(`GitHub dispatch failed with status ${response.status}`);
}

async function show(requestUrl: URL) {
  const token = requestUrl.searchParams.get("token") ?? "";
  const row = await findPending(token);
  if (!row)
    return page(
      "Review unavailable",
      "<h1>Review unavailable</h1><p>This link is invalid or has already been used.</p>",
      404,
    );
  if (new Date(row.expires_at).getTime() <= Date.now())
    return page(
      "Review expired",
      "<h1>Review expired</h1><p>This video was not published. Generate a new review request from the Sheet.</p>",
      410,
    );
  const preview = await signedPreview(row.preview_key, row.expires_at);
  const idea = row.payload.progress?.task?.idea ?? "Generated video";
  const intent = requestUrl.searchParams.get("intent");
  return page(
    `Review — ${idea}`,
    `<h1>${escapeHtml(idea)}</h1><p>No platform has received this video yet.</p><video controls preload="metadata" src="${escapeHtml(preview)}"></video><form method="post"><input type="hidden" name="token" value="${escapeHtml(token)}"><div class="actions"><button class="button approve" name="action" value="approve" type="submit">${intent === "approve" ? "Confirm approval" : "Approve publishing"}</button><button class="button reject" name="action" value="reject" type="submit">${intent === "reject" ? "Confirm rejection" : "Reject"}</button></div></form><p class="muted">The link is single-use and expires ${escapeHtml(row.expires_at)}. Approval publishes to YouTube, Instagram and Facebook.</p>`,
  );
}

async function decide(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const action = String(form.get("action") ?? "");
  if (action !== "approve" && action !== "reject")
    return page("Invalid decision", "<h1>Invalid decision</h1>", 400);
  const row = await findPending(token);
  if (!row)
    return page(
      "Decision already recorded",
      "<h1>Decision already recorded</h1><p>This single-use link cannot be submitted twice.</p>",
      409,
    );
  if (new Date(row.expires_at).getTime() <= Date.now())
    return page(
      "Review expired",
      "<h1>Review expired</h1><p>Nothing was published.</p>",
      410,
    );
  const hash = await sha256(token);
  const status = action === "approve" ? "approved" : "rejected";
  const response = await fetch(
    `${supabaseUrl}/rest/v1/approval_requests?id=eq.${encodeURIComponent(row.id)}&token_hash=eq.${hash}&status=eq.pending&select=id`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        status,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) throw new Error("Decision persistence failed");
  const changed = (await response.json()) as Array<{ id: string }>;
  if (!changed.length)
    return page(
      "Decision already recorded",
      "<h1>Decision already recorded</h1>",
      409,
    );
  let dispatchError = "";
  try {
    await dispatch(row.id);
  } catch (error) {
    dispatchError = error instanceof Error ? error.message : String(error);
    await fetch(
      `${supabaseUrl}/rest/v1/approval_requests?id=eq.${encodeURIComponent(row.id)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ dispatch_error: dispatchError.slice(0, 1000) }),
      },
    );
  }
  return page(
    action === "approve" ? "Publishing approved" : "Video rejected",
    action === "approve"
      ? `<h1>Approved</h1><p>The publishing workflow ${dispatchError ? "is queued for the next scheduled recovery run" : "has started"}. You will receive a result email with all verified links.</p>`
      : `<h1>Rejected</h1><p>No social upload will occur. Cleanup and Sheet updates ${dispatchError ? "will finish on the next scheduled recovery run" : "have been queued"}.</p>`,
  );
}

Deno.serve(async (request) => {
  try {
    if (!supabaseUrl || !serviceKey)
      return page(
        "Unavailable",
        "<h1>Review service is not configured</h1>",
        503,
      );
    if (request.method === "GET") return await show(new URL(request.url));
    if (request.method === "POST") return await decide(request);
    return new Response("Method not allowed", { status: 405 });
  } catch {
    return page(
      "Review service error",
      "<h1>Review service error</h1><p>No decision was applied. Please try again later.</p>",
      500,
    );
  }
});
