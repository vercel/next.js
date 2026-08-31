function readEnv({ FOO1, ...rest } = process.env) {
  return rest
}
console.log(readEnv())
