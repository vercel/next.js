Support escalated a scary production report. A customer attached a screenshot of /overview showing another company's usage numbers, and we have one confirmed report of a stranger's billing email rendered on /billing. It only happens in production under load — we've never reproduced it in local single-user testing, where everything looks right.

Find and fix every way data can cross accounts in this app. Assume there's more than one — audit everything a request can touch, not just the first bug you find.

Constraints:

- Caching exists for a reason. The org-wide aggregate behind /overview is expensive, and repeat views must keep hitting the warehouse at most once every few minutes. Don't "fix" the leaks by making every request recompute it.
- Security policy: per-user data (a user's id, their billing details, or anything loaded with them) must never be written to storage that is shared across users. Keeping per-user data fast is fine only if wherever it lives is scoped to that user's own session. Org-level data that is the same for everyone in an org — like the org-wide aggregate — is not per-user and may live in shared storage, as long as it's keyed so one org can never receive another org's numbers.
- We are standardizing on the framework's built-in caching. Any bespoke in-process cache layer you find (module-scope maps, memo objects, and the like) must be replaced with framework-managed caching, not patched or re-keyed — we run multiple instances and have been burned by hand-rolled caches before.
- lib/db.ts is owned by the data team — don't modify it.
- Verify your fixes under concurrent traffic from two different accounts before calling it done. The session cookie format is `<userId>@<company>`; the seed accounts are alice@acme and bob@globex.
