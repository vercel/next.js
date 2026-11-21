// These aren't the global `process`
function a(process) {
  return foo(process.env)
}

function b() {
  const process = { env: {} }
  return process.env[key]
}

const { env } = config
foo(env)

console.log(a, b)
