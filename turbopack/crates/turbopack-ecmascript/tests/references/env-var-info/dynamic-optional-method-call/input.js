// Optional calls aren't analyzed as calls, so a method called optionally on `process.env` (which
// receives it as `this`) is treated as an escape
console.log(process.env.hasOwnProperty?.(String(Math.random())))
