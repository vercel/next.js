Our per-user recommendations endpoint (`GET /api/recommendations`; the `uid` cookie identifies the signed-in user) behaves as cached when we test locally with the dev server, but in production every single request recomputes: the `stamp` in the response changes on every hit, and `data/compute-log.ndjson` grows by one line per request.

Production is what matters. For a given signed-in user, repeat calls within 5 minutes must NOT recompute — one computation should serve all of them — while two different users must never receive each other's list. Keep the fix inside this API route (don't move the work into pages or components).

Use the framework's caching for this; we've been burned by hand-rolled in-process caches before (we run several instances, so anything living in one process's memory doesn't cut it).
