#!/bin/bash
# Regrade finished calibration runs with the task's current verifier.
#
#   evals/agent-build/tools/regrade.sh <task-dir> <jobs-dir> [port]
#
# Use it when a verifier fix lands after runs were scored and the instruction
# and fixture are unchanged: the agent's work is the same, only its grading
# changes. For each finished run of the task, the patch Harbor collected is
# applied to a fresh fixture and graded by tools/run-local.sh. The result goes
# to <job>/regrade.json with the task version; report.mjs prefers it over
# Harbor's reward. Runs whose instruction or fixture changed must be rerun.
set -uo pipefail

TASK=$(cd "$1" && pwd)
JOBS=$(cd "$2" && pwd)
PORT=${3:-3400}
NAME=$(basename "$TASK")
TOOLS=$(cd "$(dirname "$0")" && pwd)
VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' "$TASK/task.toml" | head -1)
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

for job in "$JOBS/$NAME"__*/; do
  job=${job%/}
  case "$(basename "$job")" in _*) continue ;; esac
  [ -f "$job/result.json" ] || continue
  node -e 'process.exit(require(process.argv[1]).finished_at ? 0 : 1)' "$job/result.json" || continue
  patch=$(find "$job" -path '*artifacts/tmp/agent.patch' | head -1)
  if [ -z "$patch" ]; then
    echo "== $(basename "$job"): no collected patch, skipped"
    continue
  fi

  # A treated run's patch is against the treated fixture, so grade it there.
  task=$TASK
  case "$job" in
    *__agents-md)
      task=$SCRATCH/$NAME-agents-md
      rm -rf "$task" && cp -R "$TASK" "$task"
      for fixture in "$task/environment/fixture" "$task/tests/fixture"; do
        cp "$JOBS/_tasks/$NAME-agents-md/environment/fixture/AGENTS.md" \
          "$JOBS/_tasks/$NAME-agents-md/environment/fixture/CLAUDE.md" "$fixture/"
      done
      ;;
  esac

  printf '#!/bin/bash\nset -e\ngit apply --binary --whitespace=nowarn %q\n' "$patch" > "$SCRATCH/apply.sh"
  "$TOOLS/run-local.sh" "$task" "$SCRATCH/apply.sh" "$PORT" > "$SCRATCH/run.log" 2>&1
  reward=$(sed -n 's/^reward=//p' "$SCRATCH/run.log" | tail -1)
  printf '{"reward": %s, "task_version": "%s"}\n' "${reward:-0}" "$VERSION" > "$job/regrade.json"
  echo "== $(basename "$job"): reward ${reward:-0} at $VERSION"
done
