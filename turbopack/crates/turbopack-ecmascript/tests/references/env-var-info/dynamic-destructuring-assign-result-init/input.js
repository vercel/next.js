// A destructuring assignment evaluates to its source, so `env` is all of `process.env`
let FOO1
const env = ({ FOO1 } = process.env)
consume(env)
