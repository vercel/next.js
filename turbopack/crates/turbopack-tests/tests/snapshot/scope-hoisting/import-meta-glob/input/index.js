// Eager matches are static imports of a synthetic module, so scope hoisting can
// merge the synthetic module and the matches into the importing module.
const modules = import.meta.glob('./dir/*.js', { eager: true, import: 'value' })

console.log(modules)

export {}
