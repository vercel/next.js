// Optional calls on env var values don't receive `process.env`
console.log(process.env.FOO1?.toString())
console.log(process.env.FOO2.trim?.())
console.log(process?.env?.FOO3?.trim?.())
