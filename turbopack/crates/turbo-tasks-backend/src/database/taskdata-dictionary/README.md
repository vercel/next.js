# TaskData dictionary

To produce a replacement dictionary, pass TaskData cache directories to:

```sh
cargo run -p turbo-persistence --release --bin zstd_dictionary -- \
  --family 2 \
  --source-dictionary turbopack/crates/turbo-tasks-backend/src/database/taskdata-dictionary/taskdata.zdict \
  --output turbopack/crates/turbo-tasks-backend/src/database/taskdata-dictionary/taskdata.zdict \
  path/to/cache-a path/to/cache-b
```
