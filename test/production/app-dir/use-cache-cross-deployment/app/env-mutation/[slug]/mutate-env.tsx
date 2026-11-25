export function MutateEnv() {
  process.env.MUTATED_DURING_CACHE_GENERATION = '1'
  return null
}
