const p = process
console.log(p.env.FOO1, globalThis.process.env.FOO2, global.process.env.FOO3)
const {
  env: { FOO6 },
} = process
console.log(FOO6)
