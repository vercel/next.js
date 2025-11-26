'use server'

export async function testBunExternals() {
  const modules = [
    'bun:ffi',
    'bun:jsc',
    'bun:sqlite',
    'bun:test',
    'bun:wrap',
    'bun',
  ]
  const results: Record<string, string> = {}

  for (const mod of modules) {
    try {
      require(mod)
      results[mod] = 'loaded'
    } catch (e: any) {
      // Expected: Cannot find module error when not in Bun runtime
      results[mod] = e.message.includes('Cannot find module')
        ? 'external (not found)'
        : 'error'
    }
  }

  // All modules should be external (not found when not in Bun)
  const allExternal = Object.values(results).every(
    (r) => r === 'external (not found)' || r === 'loaded'
  )
  return allExternal
    ? 'All Bun modules are external'
    : 'Some modules were not properly externalized'
}
