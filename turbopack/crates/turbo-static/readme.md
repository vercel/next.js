# Turbo Static

Leverages rust-analyzer to build a complete view into the static dependency
graph for your turbo tasks project.

## How it works

- find all occurrences of #[turbo_tasks::function] across all the packages you
  want to query
- for each of the tasks we find, query rust analyzer to see which tasks call
  them
- apply some very basis control flow analysis to determine whether the call is
  made 1 time, 0/1 times, or 0+ times, corresponding to direct calls,
  conditionals, or for loops
- produce a cypher file that can be loaded into a graph database to query the
  static dependency graph

## Usage

This uses an in memory persisted database to cache rust-analyzer queries.
To reset the cache, pass the `--reindex` flag. Running will produce a
`graph.cypherl` file which can be loaded into any cypher-compatible database.

```bash
# pass in the root folders you want to analyze. the system will recursively
# parse all rust code looking for turbo tasks functions
cargo run --release -- ../../../turbo ../../../next.js
# now you can load graph.cypherl into your database of choice, such as neo4j
docker run \
    --publish=7474:7474 --publish=7687:7687 \
    --volume=$HOME/neo4j/data:/data \
    neo4j
```
