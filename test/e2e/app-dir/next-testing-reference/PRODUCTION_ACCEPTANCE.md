# Ordinary production acceptance plan

Executed against reviewed wave-nine source and matching native; see
`PRODUCTION.md` for results and precise bounds. This validates the ordinary production application and
omission of test-runner code from application output. It does not establish
support for production `next test` profiles.

Use the standard production Turbopack harness and the canonical app fixture.
Prepare its isolated installation with `skipStart: true`, remove only
`experimental.exposeTestingApiInProductionBuild` from that installation's
`next.config.js`, and then call `next.start()` once to build and start it. Keep the
canonical fixture's instrumented config unchanged. Generate any new suite with
`pnpm new-test`; do not hand-create a new suite. Record the exact final source
and native hashes, normal mode command, build log and runtime results.

Verify ordinary HTML and browser behavior:

- `/` computes 10. `/reference` contains the nested server-only message and
  Counter initial value. Concurrent alice/bob/anonymous requests remain isolated.
- In real Chromium, ordinary navigation completes and Counter hydrates and
  increments. Do not use `instant()` in this uninstrumented build.
- Send the instant-navigation testing cookie on a document request. The response
  must still contain completed dynamic content. With that cookie in a fresh
  browser context, ordinary client navigation must also complete and hydrate.
  This verifies that test control is inactive, rather than inferring inactivity
  merely from a missing symbol.

Inspect application artifacts, excluding source maps and the installed Next
package itself:

- Confirm the resolved build config does not enable the testing API.
- Check emitted client JavaScript lacks the instant-cookie listener/lock payload
  and runner facade/worker transport. Use precise known implementation markers;
  do not treat generic words such as `test` as executable-code evidence.
- Inspect application route traces and emitted module graphs for dependencies on
  `experimental/testing`, the Next test assertion primitives, foreign Vitest
  runtime, or browser-host infrastructure. Those modules must not enter the
  ordinary application graph. A `next` package file existing in node_modules is
  not evidence that it shipped in application code.
- Keep any failure as a real finding and inspect its import path before claiming
  a false positive. Server framework code may retain configuration-gated testing
  branches; a raw text match in the installed server package alone does not prove
  testing transport was enabled or leaked into the app graph.

Require a clean native/compiler/server log and normal process teardown. Keep
this evidence separate from the previously passing instrumented production
oracle, whose config deliberately enables testing transport.
