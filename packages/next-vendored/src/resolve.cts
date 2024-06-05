/**
 * This cjs function is a temporal workaround for packages that
 * we can't bundle as ESM yet
 */
export function resolveCommonjs(id: string) {
  return require.resolve(id)
}
