# protected-routes-instant-scope

A session-protected workspace under Cache Components was opted out of instant
navigation on the dev overlay's advice. It has to become instant again,
without the opt-out, while signed-out visitors get a real HTTP redirect.

## Difficulty explanation

The overlay's suggestions each fix the symptom it reports and break something
else:

- `instant = false` silences the error but leaves every workspace route
  dynamic, so nothing is prerendered and navigation stays blank.
- Awaiting the session at the top of the layout blocks the whole subtree.
- Redirecting from inside the page streams a 200 with the redirect in the
  body, which uptime checks and the mobile app do not follow.
- Rendering the sign-in prompt instead of the page drops every page segment
  from the prerender.

The working shape splits the decision: the redirect happens before rendering,
the frame and headings prerender without any session, and the session and
data stream in below it. A vendored session SDK also reads the clock, so the
agent has to keep that read out of the prerender without editing the SDK. The
Agent Feedback reports behind this task are 4070, 5011, 4442, F-009, and
F-012.

## Verification explanation

`tests/test.sh` applies the agent's patch to a clean copy of the fixture in a
separate, offline verifier, then runs these gates in order. The first failure
scores 0.

1. `check-source.mjs`: Cache Components is on, and dependencies and
   `lib/vendor/` are unchanged.
2. Type check and production build.
3. `behavior.spec.ts` against the production server: the marketing pages and
   `/login` are prerendered, every workspace route has a prerendered shell
   with the frame and heading and no customer data, signed-out and expired
   requests get a 3xx to `/login` with redirects disabled, two signed-in
   users each see only their own team, the invoice status filter still
   works, and client navigation between workspace pages is instant.
4. The production server log has no prerender or validation errors.

Every check maps to a sentence in `instruction.md`. `tests/bad-solutions/`
lists the shortcuts these gates reject.
