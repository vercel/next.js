// Lazy matches are loaded on demand, so each one is split into its own async chunk.
const lazy = import.meta.glob('./lazy/*.js')

// Eager matches are evaluated synchronously, so they stay in the entry chunk.
const eager = import.meta.glob('./eager/*.js', { eager: true })

console.log(eager)
lazy['./lazy/a.js']().then(console.log)
