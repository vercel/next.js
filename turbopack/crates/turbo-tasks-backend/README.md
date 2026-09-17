# turbo-tasks-backend

## Training a TaskData zstd dictionary

TaskData is persistence family `2`. After producing copied Turbopack cache database directories,
train and evaluate a dictionary without rebuilding the applications:

```sh
cargo run -p turbo-persistence --bin zstd_dictionary -- train \
  --family 2 --output taskdata.zdict \
  path/to/database-a path/to/database-b

cargo run -p turbo-persistence --bin zstd_dictionary -- evaluate \
  --family 2 --dictionary taskdata.zdict --json report.json \
  path/to/holdout-database-a path/to/holdout-database-b
```

Training and evaluation inputs should be disjoint. A dictionary evaluated against its own training
caches is useful only as a tool smoke test and overstates its real benefit.

The intended corpus sources are the public application matrices in `vercel/next-benchmarks` and
`vercel-labs/next-npm-stability-tests`. Record the resolved revision for each corpus run and exclude
private Vercel projects rather than requiring credentials. Corpus collection and selecting or
embedding a production dictionary are separate follow-ups.
