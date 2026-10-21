const ctx = require.context('./deps', false, /\.js$/)

console.log(ctx.keys().map((key) => ctx(key)))
