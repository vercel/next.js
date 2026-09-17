# TaskData zstd dictionary provenance

The adjacent `taskdata.zdict` is a 64 KiB dictionary trained from filesystem caches produced by
Next.js `test/production` fixtures.

## Corpus

- Next.js revision: `45b39da5ba613553540c4d7fb9196e79a58bbe61`
- Split: SHA-256 of test path, 80% train / 20% holdout
- Completed test files: 194 of 362 attempted before the sandbox disk budget stopped collection
- Valid caches: 204 train, 38 holdout
- Training policy: round-robin logical TaskData values across caches to a 64 MiB target
- Dictionary size: 65,536 bytes
- Dictionary ID: `1166300072`
- Dictionary xxh3-64: `2d9e019e3c1071f1`

The incomplete tail is a limitation of this baseline, but 242 independent caches provide broad
coverage. The checked-in script is resumable and can complete/refresh the corpus in a larger local
environment.

## Held-out results

The 38 holdout caches contained 1,462,462,144 uncompressed logical-value bytes.

| Metric                      |       zstd3 |  Dictionary |       Delta |
| --------------------------- | ----------: | ----------: | ----------: |
| Raw compressed bytes        | 674,350,217 | 460,786,575 | **-31.67%** |
| Median encode time (5 runs) |    18.646 s |     9.132 s | **-51.02%** |
| Median decode time (5 runs) |     5.822 s |     3.030 s | **-47.91%** |

The copied holdout cache directories occupied 728,480,057 bytes. The raw compressed-byte delta is
213,563,642 bytes, or 29.32% of that directory total; this is a directional total-cache estimate,
not an exact rewritten-cache measurement.

Timing is machine-specific single-process diagnostic data. The stable byte result is the primary
receipt.
