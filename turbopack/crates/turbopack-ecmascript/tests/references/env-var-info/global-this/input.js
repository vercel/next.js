console.log(globalThis.process.env.FOO1)
console.log(global.process.env.FOO2)
var p = globalThis.process
console.log(p.env.FOO3)

// Inlined, so not a runtime read
console.log(globalThis.process.env.INLINED1)
console.log(global.process.env.INLINED2)

const { FOO4 } = globalThis.process.env
console.log(FOO4)

if (globalThis.process.env.FOO_EXISTENCE1) {
  console.log('exists')
}
if ('FOO_EXISTENCE2' in global.process.env) {
  console.log('exists')
}

function shadowed(globalThis) {
  return globalThis.process.env.NOT_TRACKED
}
console.log(shadowed({ process: { env: {} } }))
