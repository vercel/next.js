// The Node engine fork of `#engine-config` (see engine-config.d.ts). Engine forks are
// the only renderer modules that may use Node APIs.

export function logError(error: unknown): void {
  console.error(error)
}
