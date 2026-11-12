# Type assertions

This directory contains the maintained TypeScript implementation of the
`expectTypeOf` API, based on [expect-type 1.4.0](https://github.com/mmkal/expect-type/tree/v1.4.0)
at commit `48743118a1da38f84269f9f6970c6861614092e0`.

The original implementation and type helpers are kept together so each execution
realm and emitted declaration graph uses the same unique-symbol brands. Imports
stay local to these modules; no external `expect-type` package is required.

Local changes add source attribution, mark type-only imports, preserve upstream
JSDoc and unique-symbol declarations with focused lint annotations, and apply
repository formatting. The runtime
and compile-time API match the original version, including compatibility type
exports. See [LICENSE](./LICENSE) for the original Apache-2.0 license and copyright.
