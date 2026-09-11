# Security upgrade evals

This is an independent `@vercel/agent-eval` project for `next upgrade --experimental-agent --experimental-agent-dry-run`.
It does not change the benchmark behind nextjs.org/evals. The suite runs four
scenarios across four model/harness combinations in Vercel Sandbox, sequentially,
with a 20-minute budget per run (16 cases total). All experiments require
`sandbox: 'vercel'`; missing credentials block execution without falling back to Docker.

- `codex`: Codex with `openai/gpt-5.6-luna`.
- `codex-terra`: Codex with `openai/gpt-5.6-terra`.
- `claude`: Claude Code with `anthropic/claude-haiku-4.5`.
- `claude-sonnet`: Claude Code with `anthropic/claude-sonnet-5`.

The `codex` and `claude` experiments define their Gateway models in
`lib/experiment.ts`, with overrides through
`NEXT_UPGRADE_CODEX_MODEL` and `NEXT_UPGRADE_CLAUDE_MODEL`. The added experiments
pin Terra and Sonnet independently. Results and archives are separated by experiment.
The native runner records the observed model when available.

Newly launched product sessions still select Luna or Haiku explicitly; existing
agent sessions retain their current model. The terminal eval records the requested
native model, then translates it to the Gateway routing ID for the selected eval
model. This transport translation is confined to the sandbox adapter.

The background-session driver follows the session returned by the terminal
launcher and evaluates its completed work, including `--experimental-agent-dry-run` behavior.
Live desktop attachment is outside this suite.

| Scenario | Entry | Required result |
| --- | --- | --- |
| same-major | Ordinary terminal → actual Next → native harness | Pages 15.5.23 → 15.5.24, compatible React dependencies, dev checks, complete local commit |
| major-migration | Existing harness → actual Next → same harness | App 14.2.35 → 16.3.3, contextual async repair, image-quality compatibility repair, complete local commit |
| existing-pr | Existing harness | Inspect matching marked draft; skip before migration writes |
| lookup-blocked | Existing harness | Report failed prerequisite and recovery condition; no migration writes |

## Run after building the local packages

From the repository root, with Vercel Sandbox and AI Gateway credentials
configured in the environment or repository-root `.env.local`. A Vercel project
OIDC token (`VERCEL_OIDC_TOKEN`) can authenticate both. Alternatively, the pinned
runner accepts `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID` for Sandbox,
plus `AI_GATEWAY_API_KEY` for the models:

```sh
pnpm eval:upgrade
# A targeted scenario, still across all four models:
pnpm eval:upgrade major-migration
# One model and scenario:
NEXT_UPGRADE_EVAL_EXPERIMENT=codex-terra pnpm eval:upgrade major-migration
```

The wrapper requires existing built outputs for `packages/next` and
`packages/next-codemod`, packs each separately, and invokes the eval framework
with this directory as cwd. It never builds implicitly. Root workspace dependencies
must be installed. The existing eval README describes sandbox/credential setup;
this suite does not install credentials or change host harness permissions.

The fixture retains its old installed Next package. The new CLI and codemod are
installed under `/tmp/next-upgrade-tools` in the sandbox. Only fixture HTTP
responses and package-runner transport are substituted: the actual CLI,
security resolver, guide packaging, handoff and codemods execute. Every run gets
an independent Git repository with no real remote. The transport also routes
`pnpm exec next upgrade` and `pnpm next upgrade` to the candidate CLI; package-local
version, build/dev and install commands still use the actual installed app/tooling. Provider reads are explicitly
simulated and logged. The agent may change the fixture and make local commits;
publication remains out of scope.

`fixtures/security/` contains synthetic advisory ranges. Setup obtains
real package engines/peer metadata, but supplies controlled release dates and
candidate versions and a fixed resolver evidence clock for reproducible policy decisions.
Harness authentication and process clocks are real. These files make no claim
about current production safety. The major fixture intentionally makes all
14/15 releases affected. A setup-only control runs the real codemod in a copy,
requires a contextual marker, requires marker-only deletion to fail, requires a
separate unmarked image-quality repair, and requires the known repair to pass. The control
source/copy is removed before treatment. An ineffective control blocks the eval;
it never counts as a successful migration.

`EVAL.ts` links to the complete shared assertions and is withheld by agent-eval
until the agent finishes. No assertion helper is shipped in the visible fixture. Assertions check actual provider reads, codemod arguments,
installed packages, unchanged inputs for stop cases, runtime behavior, retained
docs, transcripts and parent-relative commits. Build verification is specific to
the major fixture; the Pages app has no build script. The runtime helper uses a
local image fixture and distinct request cookies.

## Terminal boundary and evidence

F1 uses a Python pseudo-terminal to run `next upgrade --experimental-agent --experimental-agent-dry-run`. The actual
command discovers and launches the sandbox's native Codex or Claude binary. The
driver reads its session receipt and keeps observing after Next exits. Codex
completion comes from its JSON event log; Claude completion comes from the native
assistant turn's stop reason. A completed turn must also leave a `verified-local`
report and a new commit. Missing receipts, unsupported session formats and timeouts
are recorded as failures; they never count as successful upgrades.

The driver captures native transcripts, background output and session metadata,
and stops the worker during cleanup. Assertions inspect commits and runtime
behavior independently of the report. This tests background execution, not live
attachment in the desktop app.

Harness onboarding and model configuration are provisioned only in the disposable
Vercel VM, using the native eval runner's authority. The product command inherits
permissions and never configures a bypass. The suite requires the managed Node
image because the older default runtime cannot run its pinned codemod dependency.
The adapter selects that image and retries transient reads of existing commands;
it never retries command creation.

## Prompts and coverage boundary

Every `PROMPT.md` is the explicit user request:

```text
Run `next upgrade --experimental-agent --experimental-agent-dry-run` for this app.
```

The terminal case invokes that command directly; the other three send the request
to an active native harness. AGENTS.md and CLAUDE.md provide the same ordinary
repository context: repository authority, app behavior and
the read-only provider adapter interface. Next's supplied workflow owns migration
steps, prerequisites, completion checks and reporting. Assertions are withheld. The same-major repository normally permits publication,
so the explicit `--experimental-agent-dry-run` request must narrow delivery. Sandbox wrappers record
and block ordinary Git pushes and GitHub/GitLab CLI publication attempts; any
recorded attempt fails grading. These wrappers are instrumentation, not protection
against an agent deliberately using another binary or raw HTTP.

This suite covers explicit command invocation. Discovery from a generic request,
`next dev` triggers, scheduling, optional feature adoption and live PR publication
are deferred. Provider reads and security evidence are controlled; actual Next,
codemods, harnesses, runtime checks and local Git commits execute in the Sandbox.

## Evidence and retention

Provider simulation separates repository identity, PR summaries and PR patches.
The existing-PR case must inspect the proposed change, not infer relevance from
its title. The failed-lookup case must retain a blocker and recovery condition
without migration changes or new commits.

Packet telemetry is append-only. Context refreshes can create several packets;
assertions and the terminal driver find reports among packets recorded by the
actual CLI. Status matching is case-insensitive. The driver recognizing a final
report only ends the interactive session; withheld behavioral checks decide success.

The withheld grader writes `UPGRADE_EVIDENCE.json` after the agent finishes. It
records baseline/final HEADs, new commit messages and parent-relative patches,
provider/codemod operations and retained packet reports. The primary repository
snapshot precedes runtime grading; `postGradingRepository` records changes made
afterward, such as generated `next-env.d.ts`. Older artifacts recorded their diff
after grading only. Native HEAD-relative capture otherwise omits committed repairs.

Each invocation records outcomes and immediately archives native result directories
under `results/archive/invocation-<pid>/`, before runner deduplication can prune them.
Fingerprints include both packed tools and suite support files alongside the native
runner fields. Full diagnostics are retained independently in `results/diagnostics/`.
Input manifests record source and tarball hashes. These local artifacts are ignored.
