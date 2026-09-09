# turbo-tasks-backend

## Training a TaskData zstd dictionary

TaskData is persistence family `2`. After producing copied Turbopack cache database directories,
train and evaluate a dictionary without rebuilding the applications:

```sh
cargo run -p turbo-persistence --release --bin zstd_dictionary -- train \
  --family 2 --output taskdata.zdict \
  path/to/database-a path/to/database-b

cargo run -p turbo-persistence --release --bin zstd_dictionary -- evaluate \
  --family 2 --dictionary taskdata.zdict --json report.json \
  path/to/holdout-database-a path/to/holdout-database-b

# For caches produced after the dictionary was enabled:
cargo run -p turbo-persistence --release --bin zstd_dictionary -- evaluate \
  --family 2 --source-dictionary src/database/taskdata.zdict \
  --dictionary candidate.zdict path/to/database-a
```

Training and evaluation inputs should be disjoint. A dictionary evaluated against its own training
caches is useful only as a tool smoke test and overstates its real benefit.

The checked-in baseline is produced by
[`scripts/train-taskdata-dictionary.sh`](./scripts/train-taskdata-dictionary.sh) from preserved
`test/production` filesystem caches. Its corpus and held-out receipts are recorded in
[`src/database/taskdata-dictionary.md`](./src/database/taskdata-dictionary.md). The script is
resumable; set `CORPUS_JOBS` for bounded parallelism, `CORPUS_FAMILY` to select a keyspace (defaults
to TaskData family 2), and pass an output directory plus dictionary path.
