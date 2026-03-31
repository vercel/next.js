# next-build-test

This binary lets you sidestep all of the node bundling and run a turbo build
against a raw rust binary. It does _not_ do everything nextjs does, but it
is an ok approximation.

## Getting started

You will need a project_options file that points to some nextjs repo that has
its dependencies installed. The easiest way to do that is to run a nextjs
build using a modified binary that produces one out for you or to run the
`generate` command and tweak it manually. We cannot bundle one in the repo,
since it needs fs-specific paths and env vars.

You can run the binary with the `generate` flag to build one for you.

```sh
cargo run -- generate /path/to/project > project_options.json
cargo run -- run
```

## Flags

The `run` command supports 4 flags:

- `strategy` can be one of sequential, concurrent, or parallel. defines how
  work is structured
- `factor` defined how many pages should be built at once. defaults to num_cpus
- `limit` defines the highest number of pages to build. the pages are
  shuffled deterministically. defaults to 1 page
- `pages` a comma separated list of routes to run. queues that precise set in
  the order specified
