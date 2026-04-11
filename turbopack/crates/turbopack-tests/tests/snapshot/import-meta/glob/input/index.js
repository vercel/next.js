// Lazy glob (default)
const lazyModules = import.meta.glob('./dir/*.js')

// Eager glob
const eagerModules = import.meta.glob('./dir/*.js', { eager: true })

// Named import
const defaultExports = import.meta.glob('./dir/*.js', {
  import: 'default',
  eager: true,
})

// Negative pattern (exclude bar.js)
const filtered = import.meta.glob(['./dir/*.js', '!**/bar.js'], { eager: true })

// Multiple patterns
const multi = import.meta.glob(['./dir/*.js', './other/*.js'], { eager: true })

console.log(lazyModules, eagerModules, defaultExports, filtered, multi)
