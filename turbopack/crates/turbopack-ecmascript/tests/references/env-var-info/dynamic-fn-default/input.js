function readEnv(env = process.env) {
  return env.FOO1
}
console.log(readEnv())
