// Lazy glob (default)
const lazyModules = import.meta.glob('./dir/*.js')

// Eager glob
const eagerModules = import.meta.glob('./dir/*.js', { eager: true })

// Named import
const defaultExports = import.meta.glob('./dir/*.js', {
  import: 'default',
  eager: true,
})

console.log(lazyModules, eagerModules, defaultExports)
