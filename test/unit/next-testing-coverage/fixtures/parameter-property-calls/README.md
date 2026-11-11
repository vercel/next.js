# Constructor parameter-property call defaults

The fixtures check unique, nonoptional zero-argument identifier-call defaults in
development and production. They assert successful execution and exact coverage
counters and locations. The untouched module throws if evaluated, so its zero-hit
coverage also checks that source analysis does not execute it.

`facts.json`, `emitted.js.txt` and source maps support focused constructor,
parameter and generated-assignment association tests.
