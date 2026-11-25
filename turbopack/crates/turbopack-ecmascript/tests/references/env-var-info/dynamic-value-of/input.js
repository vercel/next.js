// `valueOf` returns `process.env` itself
const env = process.env.valueOf()
console.log(env[Math.random()])
