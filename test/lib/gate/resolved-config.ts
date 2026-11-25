/**
 * A JSON-safe snapshot of a fixture's resolved `NextConfigComplete`, as
 * produced by `NextInstance.getResolvedConfig()`.
 *
 * It is intentionally loosely typed. The snapshot round-trips through JSON, so
 * functions (`webpack`, `generateBuildId`) and other non-serializable values
 * are gone, and lazy conditions in `./conditions.ts` may want to read keys that
 * only exist after resolution and are absent from the public `NextConfig` type.
 */
export type ResolvedNextConfig = {
  experimental?: Record<string, unknown>
  [key: string]: unknown
}
