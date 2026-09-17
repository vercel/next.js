# TaskData dictionary

A 64 KiB zstd dictionary used for the `TaskData` persistence family, trained
against Turbopack caches from real-world Next.js applications.

## Provenance

Trained from 34 applications in the `next-benchmarks` corpus (9.88 GB of
TaskData values), built with `next build --turbopack` against this branch.
Private applications (`v0*`, `vercel-*`) and the synthetic `bundler-*` fixtures
were excluded from training; the private applications were kept as a held-out
set to measure generalization.

## Measured effect

Cold `next build` cache sizes, plain `Zstd3` versus `Zstd3WithDictionary`,
measured on disk with `sst_inspect`:

|                    | TaskData bytes | value bytes | whole cache |
| ------------------ | -------------- | ----------- | ----------- |
| Training (32 apps) | -5.8%          | -6.2%       | ~-4%        |
| Held out (5 apps)  | -4.5%          | -4.9%       | -3.2%       |

Every application improved. Per-application deltas ranged from -2.7% to -13.3%;
smaller applications benefit most, since zstd has less data from which to build
its own context.

The held-out figure is the one to trust: those applications were never seen
during training. `shadcn-ui-v4` is excluded from the training aggregate because
its two builds produced materially different amounts of work (2.99M vs 3.76M
entries), making the sizes incomparable; normalized per entry it was -8.4%,
in line with the rest.

## Regenerating

Pass TaskData cache directories to the training tool. Because caches written by
a build that already embeds a dictionary record its ID, supply that dictionary
as `--source-dictionary` when re-training from such caches; caches written with
plain `Zstd3` need no source dictionary.

```sh
cargo run -p turbo-persistence --release --bin zstd_dictionary -- \
  --family 2 \
  --output turbopack/crates/turbo-tasks-backend/src/database/taskdata-dictionary/taskdata.zdict \
  path/to/cache-a path/to/cache-b
```

The tool's own comparison table evaluates on its training inputs, so treat it as
an upper bound and confirm with real `next build` cache sizes.

## TaskMeta

A dictionary was also trained and evaluated for `TaskMeta` (family 1) against
the same corpus. It is not worth shipping: it improves on plain `Zstd3` by only
1.8%, which does not justify a second embedded dictionary.

Separately, that evaluation showed `TaskMeta` is currently `Lz4` and that plain
`Zstd3` would compress it 26.1% smaller (180 MB across the corpus). That change
is not made here: `TaskMeta` is read on every task lookup, and the measurement
showed encode and decode times roughly tripling, so the space/latency tradeoff
needs its own evaluation.
