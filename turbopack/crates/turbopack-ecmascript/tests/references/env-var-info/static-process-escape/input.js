// `process` itself escaping is deliberately not treated as a dynamic `process.env` access
foo(process)
console.log(process.env.FOO1)
