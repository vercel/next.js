// The right side of `&&` becomes the result
const env = typeof process !== 'undefined' && process.env
console.log(env)
