# Bundle analyzer UI

This app enables the Rust React Compiler (`reactCompiler` and `turbopackRustReactCompiler` in `next.config.mjs`). When adding or reviewing UI code:

- Prefer plain derived values and functions over `useMemo`, `useCallback`, or `memo` used only to cache renders or stabilize props; the compiler handles ordinary memoization. Review new instances in every bundle-analyzer change.
- Even expensive pure calculations generally need no manual memo in a component the compiler optimizes. Before keeping one, check compiled output: keep it if the compiler skips that component, if an imperative API needs stable identity, or if measurements show the compiler misses a costly path. Explain the exception in the code.
- Keep **correct dependencies** for effects, subscriptions, and imperative hooks. Do not remove an effect dependency array just to eliminate memoization; dependencies describe behavior, not merely an optimization.
- Verify affected code with the app's typecheck and a production build (`pnpm --filter=@next/bundle-analyzer-ui exec tsc --noEmit` and `pnpm --filter=@next/bundle-analyzer-ui build`) so the compiler actually runs.
