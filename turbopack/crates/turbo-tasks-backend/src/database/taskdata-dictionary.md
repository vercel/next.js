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

Evaluation approximates production compression units: small values are accumulated into SST-local
8–12 KiB blocks, while medium values and blobs remain independent. The corrected evaluator was run
against 4 held-out caches from a fresh 20-test smoke corpus, containing 11,778 compression units and
176,698,226 uncompressed bytes.

| Metric                      |      zstd3 | Dictionary |       Delta |
| --------------------------- | ---------: | ---------: | ----------: |
| Raw compressed bytes        | 52,387,060 | 44,924,356 | **-14.25%** |
| Median encode time (5 runs) |  772.23 ms |  822.26 ms |  **+6.48%** |
| Median decode time (5 runs) |  225.30 ms |  192.72 ms | **-14.46%** |

The copied holdout cache directories occupied 77,370,864 bytes. The raw compressed-byte delta is
7,462,704 bytes, or 9.65% of that directory total; this is a directional total-cache estimate, not
an exact rewritten-cache measurement.

The original 38-cache evaluation treated every logical value as a compression unit and overstated
the benefit, so those numbers are intentionally not retained here. The corrected result meets the
accepted ≥2% size / ≤10% encode-regression / no-decode-regression gate.

Timing is machine-specific single-process diagnostic data. The stable byte result is the primary
receipt.
