# Next.js agent feedback protocol

Use this protocol only when the managed Next.js feedback block in `AGENTS.md` instructs you to prepare agent feedback. Next.js Skills and upgrade workflows may add feedback candidates only while that managed block is present. Prepare report drafts for the user to review, but never submit them for the user.

## Terms

- **Current user request:** The implementation work being completed.
- **Feedback candidate:** Temporary anonymized facts about one possible issue.
- **Reporting pass:** The single evaluation immediately before the final response.
- **Report draft:** The structured payload created from a qualifying feedback candidate.
- **Review form:** The browser page where the user edits or sends a report.

## Decide whether a feedback candidate qualifies

Create a separate report draft for each distinct Next.js friction point that causes unexpected framework behavior, a documentation mismatch, a misleading error, repeated failed approaches, or a non-obvious workaround. An issue does not need to block the current user request, but it should require a meaningful detour or be likely to recur.

Do not report routine first-pass debugging, vague task scope, problems caused by unverified changes, or issues resolved immediately by following existing guidance. Keep unrelated issues in separate report drafts.

## Run the reporting pass before the final response

Do not interrupt the current user request when friction first qualifies. Retain each distinct set of bounded, anonymized facts as a feedback candidate in the context of the current user request, then continue the work.

Skills and upgrade workflows can add feedback candidates while completing the current user request. Immediately before the final response, after completing all implementation work and tool calls, run one reporting pass. For example, verification performed while preparing a pull request should wait until the pull request work is complete.

The managed feedback block owns the reporting pass. Evaluate every feedback candidate once, including candidates added by Skills or upgrade workflows. Do not create duplicate report drafts or reopen a review form already presented to the user.

Each review form accepts one report draft. For every qualifying feedback candidate, prepare one report draft and attempt to open it in a separate review form. After evaluating every feedback candidate and attempting to open each qualifying report draft, clear the feedback candidate queue from the context of the current user request. The user owns the open forms; do not close or recreate them. Nothing is transmitted before the user explicitly sends a report.

## Prepare each report draft

- **Scope:** Report one observed Next.js behavior. Do not combine separate problems or infer a root cause.
- **Trigger:** Set `triggerReason` to `unexpected-behavior`, `documentation-mismatch`, `misleading-error`, `repeated-failed-approach`, or `non-obvious-workaround`. Choose the single reason that caused the report draft.
- **Summary:** Use a short, factual `title` that names the observed behavior.
- **Setup:** Set `mode` to `development`, `production-build`, `production-server`, or `test`. Set `bundler` to `turbopack`, `webpack`, or `unknown`. Add up to three generic `relevantFeatures` when they help reproduce the issue.
- **Reproduction:** Write 1–4 ordered `steps`. Include the generic starting state, the relevant Next.js feature or API, and the action that triggers the behavior. Split only actions or conditions whose order matters.
- **Results:** Write 1–3 independently verifiable `observed` facts and one precise `expected` result. Split an observation only when each fact can stand alone and may be removed independently. Add `comparison` only when you observed a control or workaround.
- **Outcome:** Set `frequency` to `once` or `reproduced`. Set `outcome` to `blocked`, `worked-around`, or `resolved`.
- **Measurements:** Include measurements such as memory use, duration, extra builds, or repeated attempts only when observed directly. Do not estimate elapsed time, token usage, or tool-call counts.
- **Privacy:** Replace customer, project, route, and component names with generic descriptions. Do not include source code, prompts, logs, stack traces, file paths, URLs, secrets, personal information, or unrelated product details.

## Encode the report draft

Create a schema version 5 payload using only useful evidence. Always include `nextVersion` and `agent`. Omit `comparison` and `relevantFeatures` when they are not needed. Encode the UTF-8 JSON as unpadded base64url.

```json
{
  "schemaVersion": 5,
  "triggerReason": "unexpected-behavior",
  "title": "Persistent Turbopack caching exhausted a worker on a warm build",
  "setup": {
    "mode": "production-build",
    "bundler": "turbopack",
    "relevantFeatures": ["Persistent cache"]
  },
  "steps": [
    "Enable persistent Turbopack caching and run a successful cold `next build` in a 32 GiB Linux environment.",
    "Without changing the application or runtime, run `next build` again and observe the main build process memory."
  ],
  "observed": [
    "The warm build exhausted a 32 GiB Linux worker after the cold build succeeded.",
    "The main build process reached about 25 GiB resident memory before it was killed."
  ],
  "expected": "The warm build should use comparable or less memory than the cold build.",
  "comparison": "Disabling persistent caching allowed two consecutive builds to finish in about two minutes each.",
  "frequency": "reproduced",
  "outcome": "worked-around",
  "nextVersion": "<version>",
  "agent": "<agent name>"
}
```

## Open the review form

If these instructions begin with a **Dry run** section, encode each review URL but do not open a browser tab. Print the URLs for inspection, keep the feedback candidate queue, and do not mark the reporting pass complete.

For each report draft, attempt to open the following URL once in a separate tab in the user's default browser. Use the browser-opening capability already available in the agent environment. Replace `<encoded-json>` with the encoded payload.

```text
https://nextjs.org/agent-feedback#report=<encoded-json>
```

Do not ask for permission before opening the review forms. Opening a form does not send feedback. If a form does not open, do not retry, investigate the failure, install tooling, or change host configuration. Include the review URL in the final response so the user can open it manually.

After attempting to open every review form, clear the feedback candidate queue from the context of the current user request. Mention opened forms and fallback URLs in the final response. Never submit a report or close a review form for the user.
