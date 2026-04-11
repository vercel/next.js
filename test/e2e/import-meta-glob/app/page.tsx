// Lazy glob
const lazyModules = import.meta.glob('./modules/*.ts')

// Eager glob
const eagerModules = import.meta.glob('./modules/*.ts', { eager: true })

// Named import (eager)
const defaultExports = import.meta.glob('./modules/*.ts', {
  import: 'default',
  eager: true,
})

// Negative pattern
const filteredModules = import.meta.glob(['./modules/*.ts', '!**/skip.ts'], {
  eager: true,
})

// Multiple patterns (modules + other)
const multiModules = import.meta.glob(['./modules/*.ts', './other/*.ts'], {
  eager: true,
})

export default async function Page() {
  // Resolve lazy modules
  const lazyKeys = Object.keys(lazyModules).sort()
  const lazyResults: Record<string, string> = {}
  for (const key of lazyKeys) {
    const mod = await lazyModules[key]()
    lazyResults[key] = (mod as any).name
  }

  // Get eager module names
  const eagerKeys = Object.keys(eagerModules).sort()
  const eagerResults: Record<string, string> = {}
  for (const key of eagerKeys) {
    eagerResults[key] = (eagerModules[key] as any).name
  }

  // Get default exports
  const defaultKeys = Object.keys(defaultExports).sort()
  const defaultResults: Record<string, string> = {}
  for (const key of defaultKeys) {
    defaultResults[key] = (defaultExports[key] as any)()
  }

  // Get filtered module names (skip.ts should be excluded)
  const filteredKeys = Object.keys(filteredModules).sort()
  const filteredResults: Record<string, string> = {}
  for (const key of filteredKeys) {
    filteredResults[key] = (filteredModules[key] as any).name
  }

  // Get multi-pattern results (modules + other)
  const multiKeys = Object.keys(multiModules).sort()
  const multiResults: Record<string, string> = {}
  for (const key of multiKeys) {
    multiResults[key] = (multiModules[key] as any).name
  }

  return (
    <div>
      <div id="lazy-keys">{JSON.stringify(lazyKeys)}</div>
      <div id="lazy-results">{JSON.stringify(lazyResults)}</div>
      <div id="eager-keys">{JSON.stringify(eagerKeys)}</div>
      <div id="eager-results">{JSON.stringify(eagerResults)}</div>
      <div id="default-results">{JSON.stringify(defaultResults)}</div>
      <div id="filtered-keys">{JSON.stringify(filteredKeys)}</div>
      <div id="filtered-results">{JSON.stringify(filteredResults)}</div>
      <div id="multi-keys">{JSON.stringify(multiKeys)}</div>
      <div id="multi-results">{JSON.stringify(multiResults)}</div>
    </div>
  )
}
