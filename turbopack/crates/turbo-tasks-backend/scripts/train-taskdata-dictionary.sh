#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
output_root=${1:-/tmp/taskdata-dictionary-corpus}
dictionary=${2:-$repo_root/turbopack/crates/turbo-tasks-backend/src/database/taskdata.zdict}
shift $(( $# >= 2 ? 2 : $# ))
jobs=${CORPUS_JOBS:-4}
family=${CORPUS_FAMILY:-2}

mkdir -p "$output_root"/{train,holdout,logs,tmp,reports,state}
manifest="$output_root/manifest.tsv"

if (( $# )); then
  tests=("$@")
else
  mapfile -t tests < <(find "$repo_root/test/production" -name '*.test.ts' -print | sort)
fi
if [[ -n ${CORPUS_LIMIT:-} ]]; then
  tests=("${tests[@]:0:$CORPUS_LIMIT}")
fi

digest_for() {
  printf '%s' "$1" | sha256sum | cut -d' ' -f1
}

# Migrate output from the earlier sequential collector once so interrupted runs can resume.
if [[ -f $manifest ]] && ! compgen -G "$output_root/state/*.tsv" >/dev/null; then
  while IFS=$'\t' read -r test_path split status cache; do
    [[ $test_path == test || -z $test_path ]] && continue
    digest=$(digest_for "$test_path")
    printf '%s\t%s\t%s\t%s\n' "$test_path" "$split" "$status" "$cache" \
      >> "$output_root/state/$digest.tsv"
  done < "$manifest"
fi
rm -f "$manifest"

run_case() {
  local test_path=$1 relative digest split case_root log status cache_index current cache destination state_tmp
  relative=${test_path#"$repo_root/"}
  digest=$(digest_for "$relative")
  [[ -f $output_root/state/$digest.tsv ]] && return 0
  if (( 16#${digest:0:2} % 5 == 0 )); then split=holdout; else split=train; fi
  case_root="$output_root/tmp/$digest"
  rm -rf "$case_root"
  mkdir -p "$case_root"
  log="$output_root/logs/$digest.log"
  echo "[$split] $relative"
  set +e
  (
    cd "$repo_root"
    TMPDIR="$case_root" NEXT_TEST_SKIP_CLEANUP=1 \
      pnpm test-start-turbo "$relative"
  ) >"$log" 2>&1
  status=$?
  set -e
  cache_index=0
  state_tmp="$output_root/state/$digest.tmp"
  : > "$state_tmp"
  while IFS= read -r current; do
    cache=$(dirname "$current")
    compgen -G "$cache/*.meta" >/dev/null || continue
    compgen -G "$cache/*.sst" >/dev/null || continue
    destination="$output_root/$split/${digest}-${cache_index}"
    rm -rf "$destination"
    cp -a "$cache" "$destination"
    printf '%s\t%s\t%s\t%s\n' "$relative" "$split" "$status" "$destination" >> "$state_tmp"
    cache_index=$((cache_index + 1))
  done < <(find "$case_root" -type f -name CURRENT -path '*/.next/cache/turbopack/*' | sort)
  if (( cache_index == 0 )); then
    printf '%s\t%s\t%s\t\n' "$relative" "$split" "$status" >> "$state_tmp"
  fi
  mv "$state_tmp" "$output_root/state/$digest.tsv"
  rm -rf "$case_root"
}

for test_path in "${tests[@]}"; do
  run_case "$test_path" &
  while (( $(jobs -rp | wc -l) >= jobs )); do
    wait -n || true
  done
done
wait

printf 'test\tsplit\tstatus\tcache\n' > "$manifest"
while IFS= read -r state; do
  cat "$state" >> "$manifest"
done < <(find "$output_root/state" -name '*.tsv' | sort)

mapfile -t train_caches < <(
  for cache in "$output_root"/train/*; do
    [[ -d $cache ]] || continue
    compgen -G "$cache/*.meta" >/dev/null && compgen -G "$cache/*.sst" >/dev/null && printf '%s\n' "$cache"
  done | sort
)
mapfile -t holdout_caches < <(
  for cache in "$output_root"/holdout/*; do
    [[ -d $cache ]] || continue
    compgen -G "$cache/*.meta" >/dev/null && compgen -G "$cache/*.sst" >/dev/null && printf '%s\n' "$cache"
  done | sort
)
if (( ${#train_caches[@]} == 0 || ${#holdout_caches[@]} == 0 )); then
  echo "Need at least one train and one holdout cache; see $manifest" >&2
  exit 1
fi

cd "$repo_root"
source_args=()
source_dictionary=${SOURCE_DICTIONARY:-$dictionary}
if [[ -f $source_dictionary ]]; then
  source_copy="$output_root/source-dictionary.zdict"
  cp "$source_dictionary" "$source_copy"
  source_args=(--source-dictionary "$source_copy")
fi
cargo run -p turbo-persistence --release --bin zstd_dictionary -- train \
  --family "$family" "${source_args[@]}" --output "$dictionary" "${train_caches[@]}"
for run in 1 2 3 4 5; do
  cargo run -p turbo-persistence --release --bin zstd_dictionary -- evaluate \
    --family "$family" "${source_args[@]}" --dictionary "$dictionary" \
    --json "$output_root/reports/holdout-$run.json" \
    "${holdout_caches[@]}"
done

echo "Dictionary: $dictionary"
echo "Manifest: $manifest"
echo "Reports: $output_root/reports"
