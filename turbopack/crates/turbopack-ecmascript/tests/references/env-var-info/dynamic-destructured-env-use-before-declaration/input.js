// The escaping use precedes the declaration in source order
function getEnv() {
  return env
}

const { env } = process
console.log(getEnv())
