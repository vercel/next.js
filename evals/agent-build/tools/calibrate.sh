#!/bin/bash
# Run a pass@1 calibration cohort for Agent Build tasks on Vercel Sandbox.
#
#   evals/agent-build/tools/calibrate.sh <env-file> <jobs-dir> <task-dir>...
#
# The env file holds VERCEL_OIDC_TOKEN for the measurement project and a
# spend-limited AI_GATEWAY_API_KEY. It is never read by this script, only
# passed to Harbor. Edit COHORT to change the agents and models; keep one
# attempt per cell so the first valid attempt is the pass@1 score, and let
# --max-retries rerun only runner exceptions, never a completed attempt.
#
# TREATMENT=agents-md runs a generated copy of each task whose fixture also
# has the standard Next.js AGENTS.md and a CLAUDE.md that imports it; the
# instruction, verifier, and runtime are unchanged. The default is base.
#
# Each (task, agent, model, treatment) becomes its own Harbor job under
# <jobs-dir>, so a cell can be rerun or regraded alone.
#
# When only a verifier changed, regrade instead of rerunning:
#   evals/agent-build/tools/calibrate.sh --regrade <env-file> <jobs-dir> <task-dir>...
# runs `harbor job regrade` on every finished job of those tasks with the
# current verifier, on the recorded patches and without agent cost, and
# writes the new jobs under <jobs-dir>/_regraded; report.mjs prefers them.
# A change to the instruction or fixture needs new runs instead.
#
# To learn whether a failure is stable, confirm it:
#   evals/agent-build/tools/calibrate.sh --confirm <env-file> <jobs-dir> <task-dir>...
# reruns every valid failure twice under <jobs-dir>/_confirm. Confirmations
# never change the pass@1 score; the report shows how many repeated.
#
# Summarize with:
#   evals/agent-build/tools/calibrate.sh --summary <jobs-dir>
set -uo pipefail

HARBOR=${HARBOR:-harbor}
TREATMENT=${TREATMENT:-base}

# agent|model|effort|agent options|api format. Frontier first, then the weaker
# tier. Effort is passed only when set. Agent options are comma-separated
# key=value pairs passed as --agent-kwarg. Two gateway quirks live here:
# Claude Code's SDK appends /v1/messages itself, so it needs the bare gateway
# host; OpenCode picks Google's native API for google/* models, which the
# gateway does not serve, so those rows force the OpenAI-compatible format.
COHORT=(
  "claude-code|anthropic/claude-opus-5.5|high|base_url=https://ai-gateway.vercel.sh|"
  "codex|openai/gpt-6.1-sol|high||"
  "opencode|google/gemini-4-argon|||openai_chat_completions"
  "codex|openai/gpt-6-luna|high||"
  "opencode|google/gemini-3.8-flash|||openai_chat_completions"
  "opencode|zai/glm-5.2|||openai_chat_completions"
)

if [ "${1:-}" = "--summary" ]; then
  jobs=$2
  printf '%-34s %-14s %-32s %s\n' task agent model reward
  for result in "$jobs"/*/result.json; do
    [ -f "$result" ] || continue
    node -e '
      const path = require("path");
      const file = path.resolve(process.argv[1]);
      const r = require(file);
      const name = path.basename(path.dirname(file));
      const [task, agent, model] = name.split("__");
      const ev = Object.values(r.stats?.evals ?? {})[0] ?? {};
      const mean = ev.metrics?.[0]?.mean;
      const errors = ev.n_errors ?? 0;
      console.log(`${task.padEnd(34)} ${agent.padEnd(14)} ${model.padEnd(32)} ${errors ? `error (${Object.keys(ev.exception_stats ?? {}).join(",")})` : mean}`);
    ' "$result"
  done
  exit 0
fi

REGRADE=''
CONFIRM=''
case "${1:-}" in
  --regrade) REGRADE=1; shift ;;
  --confirm) CONFIRM=1; shift ;;
esac

ENV_FILE=$1
mkdir -p "$2"
JOBS=$(cd "$2" && pwd)
shift 2

mkdir -p "$JOBS"
# Same text as the agent-eval agents-md variant (evals/lib/setup.ts).
AGENTS_MD='<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->'

treat() {
  local task=$1 copy="$JOBS/_tasks/$(basename "$1")-$TREATMENT"
  rm -rf "$copy" && mkdir -p "$JOBS/_tasks" && cp -R "$task" "$copy"
  for fixture in "$copy/environment/fixture" "$copy/tests/fixture"; do
    printf '%s\n' "$AGENTS_MD" > "$fixture/AGENTS.md"
    printf '@AGENTS.md\n' > "$fixture/CLAUDE.md"
  done
  echo "$copy"
}

# Record the cohort so the report can list models that have not started yet.
mkdir -p "$JOBS"
printf '%s\n' "${COHORT[@]}" | node -e '
  const rows = require("fs").readFileSync(0, "utf8").trim().split("\n")
  const cohort = rows.map((row) => { const [agent, model] = row.split("|"); return { agent, model } })
  require("fs").writeFileSync(process.argv[1], JSON.stringify(cohort, null, 2) + "\n")
' "$JOBS/cohort.json"

case "$TREATMENT" in
  base) suffix='' ;;
  agents-md) suffix='__agents-md' ;;
  *) echo "unknown TREATMENT: $TREATMENT" >&2; exit 2 ;;
esac

if [ -n "$REGRADE" ]; then
  mkdir -p "$JOBS/_regraded"
  for task in "$@"; do
    name=$(basename "$task")
    base_task=$(cd "$task" && pwd)
    for job in "$JOBS/$name"__*/; do
      job=${job%/}
      [ -f "$job/result.json" ] || continue
      node -e 'process.exit(require(process.argv[1]).finished_at ? 0 : 1)' "$job/result.json" || continue
      verifier=$base_task
      case "$job" in *__agents-md) TREATMENT=agents-md verifier=$(treat "$base_task") ;; esac
      echo "== regrade $(basename "$job")"
      rm -rf "$JOBS/_regraded/$(basename "$job")"
      (set -a && . "$ENV_FILE" && set +a &&
        "$HARBOR" job regrade "$job" -p "$verifier" -e vercel \
          -o "$JOBS/_regraded" --job-name "$(basename "$job")") \
        > "$JOBS/_regraded/$(basename "$job").log" 2>&1 ||
        echo "   harbor exited non-zero; see $JOBS/_regraded/$(basename "$job").log"
    done
  done
  exit 0
fi

if [ -n "$CONFIRM" ]; then
  mkdir -p "$JOBS/_confirm"
  for task in "$@"; do
    name=$(basename "$task")
    base_task=$(cd "$task" && pwd)
    for job in "$JOBS/$name"__*/; do
      job=${job%/}
      # A valid failure: finished, no runner error, reward 0 (after a regrade
      # when one exists).
      node -e '
        const fs = require("fs"), path = require("path")
        const [file, regraded] = process.argv.slice(1)
        const pick = fs.existsSync(regraded) ? regraded : file
        const r = JSON.parse(fs.readFileSync(pick, "utf8"))
        const ev = Object.values(r.stats?.evals ?? {})[0] ?? {}
        const runnerError = Object.keys(ev.exception_stats ?? {}).some((n) => n !== "AgentTimeoutError")
        process.exit(r.finished_at && !runnerError && ev.metrics?.[0]?.mean === 0 ? 0 : 1)
      ' "$job/result.json" "$JOBS/_regraded/$(basename "$job")/result.json" 2>/dev/null || continue
      verifier=$base_task
      case "$job" in *__agents-md) TREATMENT=agents-md verifier=$(treat "$base_task") ;; esac
      agent=$(node -e 'console.log(require(process.argv[1]).agents[0].name)' "$job/config.json")
      model=$(node -e 'console.log(require(process.argv[1]).agents[0].model_name)' "$job/config.json")
      for row in "${COHORT[@]}"; do
        IFS='|' read -r r_agent r_model effort options api_format <<< "$row"
        [ "$r_agent" = "$agent" ] && [ "$r_model" = "$model" ] || continue
        for attempt in 1 2; do
          confirm="$(basename "$job")__confirm-$attempt"
          [ -f "$JOBS/_confirm/$confirm/result.json" ] && continue
          echo "== confirm $confirm"
          args=(run --path "$verifier" --agent "$agent" --model "$model" --env vercel
            --env-file "$ENV_FILE" --api-key-name AI_GATEWAY_API_KEY
            --n-attempts 1 --max-retries 2 --jobs-dir "$JOBS/_confirm" --job-name "$confirm")
          case "$options" in *base_url=*) ;; *) args+=(--base-url https://ai-gateway.vercel.sh/v1) ;; esac
          [ -n "$effort" ] && args+=(--effort "$effort")
          [ -n "$api_format" ] && args+=(--api-format "$api_format")
          if [ -n "$options" ]; then
            IFS=',' read -ra pairs <<< "$options"
            for pair in "${pairs[@]}"; do args+=(--agent-kwarg "$pair"); done
          fi
          "$HARBOR" "${args[@]}" > "$JOBS/_confirm/$confirm.log" 2>&1 ||
            echo "   harbor exited non-zero; see $JOBS/_confirm/$confirm.log"
        done
      done
    done
  done
  exit 0
fi

for task in "$@"; do
  name=$(basename "$task")
  [ "$TREATMENT" = base ] || task=$(treat "$task")
  for row in "${COHORT[@]}"; do
    IFS='|' read -r agent model effort options api_format <<< "$row"
    job="${name}__${agent}__${model//\//-}${suffix}"
    if [ -f "$JOBS/$job/result.json" ]; then
      if node -e '
        const r = require(require("path").resolve(process.argv[1]));
        const ev = Object.values(r.stats?.evals ?? {})[0] ?? {};
        const reward = ev.metrics?.[0]?.mean;
        // An agent timeout is a scored failure; other exceptions are runner errors.
        const runnerError = Object.keys(ev.exception_stats ?? {}).some((name) => name !== "AgentTimeoutError");
        process.exit(r.finished_at && !runnerError && Number.isFinite(reward) ? 0 : 1);
      ' "$JOBS/$job/result.json"; then
        echo "== skip $job (valid scored result exists)"
        continue
      fi

      discarded="$JOBS/_discarded/$job-$(date -u +%Y%m%dT%H%M%SZ)"
      mkdir -p "$JOBS/_discarded"
      mv "$JOBS/$job" "$discarded"
      echo "== retry $job (discarded invalid result at $discarded)"
    fi
    echo "== $job"
    args=(run --path "$task" --agent "$agent" --model "$model" --env vercel
      --env-file "$ENV_FILE" --api-key-name AI_GATEWAY_API_KEY
      --n-attempts 1 --max-retries 2 --jobs-dir "$JOBS" --job-name "$job")
    # The global flag wins over a per-agent base_url option, so only pass it
    # when the row does not bring its own.
    case "$options" in
      *base_url=*) ;;
      *) args+=(--base-url https://ai-gateway.vercel.sh/v1) ;;
    esac
    [ -n "$effort" ] && args+=(--effort "$effort")
    [ -n "$api_format" ] && args+=(--api-format "$api_format")
    if [ -n "$options" ]; then
      IFS=',' read -ra pairs <<< "$options"
      for pair in "${pairs[@]}"; do args+=(--agent-kwarg "$pair"); done
    fi
    "$HARBOR" "${args[@]}" > "$JOBS/$job.log" 2>&1 || echo "   harbor exited non-zero; see $JOBS/$job.log"
  done
done

"$0" --summary "$JOBS"
