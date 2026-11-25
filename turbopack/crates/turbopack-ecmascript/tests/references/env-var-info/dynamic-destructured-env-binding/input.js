// Destructuring `env` into a binding is conservatively treated as an escape of `process.env`, like
// `const env = process.env`, even if the binding is only used in statically analyzable ways
const { env } = process
console.log(env.FOO4, 'FOO5' in env)
