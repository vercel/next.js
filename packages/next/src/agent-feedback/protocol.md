# Next.js agent feedback protocol

Use this protocol only when the managed Next.js feedback block in `AGENTS.md` or `CLAUDE.md` instructs you to prepare agent feedback. Next.js Skills and upgrade workflows may add candidates to the shared task queue only while that managed block is present. Prepare reports for the user to review, but never submit them for the user.

## Decide whether to prepare a report

Prepare a separate report for each distinct Next.js friction point that causes unexpected framework behavior, a documentation mismatch, a misleading error, repeated failed approaches, or a non-obvious workaround. An issue does not need to block the task, but it should require a meaningful detour or be likely to recur.

Do not report routine first-pass debugging, vague task scope, problems caused by unverified changes, or issues resolved immediately by following existing guidance. Keep unrelated issues in separate reports.

## Defer review until a stopping point

Do not interrupt an active workflow when friction first qualifies. Retain each distinct set of bounded, anonymized candidate facts in the current task context, then continue the work.

If a candidate originated in a Skill inside a larger task, keep it in the current task context and continue the larger task. Prepare the review only at the final stopping point of the overall user task. For example, verification performed while preparing a pull request should wait until the pull request work is complete.

The managed feedback block owns one feedback pass for the task. Run the instruction command at most once, even when a Skill or upgrade workflow added candidates to the queue. Do not open duplicate reviews.

Each review form accepts one report. If several candidates qualify before the stopping point, prepare and open one separate review tab for each candidate. After opening all review tabs, clear the retained candidate queue from the task context and mark the feedback pass complete. The user owns the open tabs; do not close or recreate them. Nothing is transmitted before the user explicitly sends a report.

## Prepare each report

- **Scope:** Report one observed Next.js behavior. Do not combine separate problems or infer a root cause.
- **Trigger:** Set `triggerReason` to `unexpected-behavior`, `documentation-mismatch`, `misleading-error`, `repeated-failed-approach`, or `non-obvious-workaround`. Choose the single reason that caused the report.
- **Summary:** Use a short, factual `title` that names the observed behavior.
- **Setup:** Set `mode` to `development`, `production-build`, `production-server`, or `test`. Set `bundler` to `turbopack`, `webpack`, or `unknown`. Add up to three generic `relevantFeatures` when they help reproduce the issue.
- **Reproduction:** Write 1–4 ordered `steps`. Include the generic starting state, the relevant Next.js feature or API, and the action that triggers the behavior. Split only actions or conditions whose order matters.
- **Results:** Write 1–3 independently verifiable `observed` facts and one precise `expected` result. Split an observation only when each fact can stand alone and may be removed independently. Add `comparison` only when you observed a control or workaround.
- **Outcome:** Set `frequency` to `once` or `reproduced`. Set `outcome` to `blocked`, `worked-around`, or `resolved`.
- **Measurements:** Include measurements such as memory use, duration, extra builds, or repeated attempts only when observed directly. Do not estimate elapsed time, token usage, or tool-call counts.
- **Privacy:** Replace customer, project, route, and component names with generic descriptions. Do not include source code, prompts, logs, stack traces, file paths, URLs, secrets, personal information, or unrelated product details.

## Encode the report

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

For each report, attempt to open the following URL once in a separate tab in the user's default browser. Use the browser-opening capability already available in the agent environment. Replace `<encoded-json>` with the encoded payload.

```text
https://nextjs.org/agent-feedback#report=<encoded-json>
```

Do not ask for permission before opening the review forms. Opening a form does not send feedback. If a form does not open, do not retry, investigate the failure, install tooling, or change host configuration. Print the review URL in your next progress update so the user can open it manually.

After attempting to open every form, clear the retained friction candidates from the task context. Continue the current task, mention any forms that opened in the next progress update, and never submit or close a report for the user.
