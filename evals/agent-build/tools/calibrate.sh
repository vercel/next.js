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
# Each (task, agent, model) becomes its own Harbor job under <jobs-dir>, so a
# cell can be rerun or regraded alone. Summarize with:
#   evals/agent-build/tools/calibrate.sh --summary <jobs-dir>
set -uo pipefail

HARBOR=${HARBOR:-harbor}

# agent|model|effort|agent options. Frontier first, then the weaker tier.
# Effort is passed only when set. Agent options are comma-separated key=value
# pairs passed as --agent-kwarg. Claude Code's SDK appends /v1/messages itself,
# so it needs the bare gateway host instead of the /v1 base URL below.
COHORT=(
  "claude-code|anthropic/claude-opus-5.5|high|base_url=https://ai-gateway.vercel.sh"
  "codex|openai/gpt-6.1-sol|high|"
  "opencode|google/gemini-4-argon||"
  "codex|openai/gpt-6-luna|high|"
  "opencode|google/gemini-3.8-flash||"
  "opencode|zai/glm-5.2||"
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

ENV_FILE=$1
JOBS=$2
shift 2

mkdir -p "$JOBS"
for task in "$@"; do
  name=$(basename "$task")
  for row in "${COHORT[@]}"; do
    IFS='|' read -r agent model effort options <<< "$row"
    job="${name}__${agent}__${model//\//-}"
    if [ -f "$JOBS/$job/result.json" ]; then
      echo "== skip $job (result exists)"
      continue
    fi
    echo "== $job"
    args=(run --path "$task" --agent "$agent" --model "$model" --env vercel
      --env-file "$ENV_FILE" --base-url https://ai-gateway.vercel.sh/v1
      --api-key-name AI_GATEWAY_API_KEY --n-attempts 1 --max-retries 2
      --jobs-dir "$JOBS" --job-name "$job")
    [ -n "$effort" ] && args+=(--effort "$effort")
    if [ -n "$options" ]; then
      IFS=',' read -ra pairs <<< "$options"
      for pair in "${pairs[@]}"; do args+=(--agent-kwarg "$pair"); done
    fi
    "$HARBOR" "${args[@]}" > "$JOBS/$job.log" 2>&1 || echo "   harbor exited non-zero; see $JOBS/$job.log"
  done
done

"$0" --summary "$JOBS"
