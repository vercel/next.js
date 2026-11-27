// Loose equality with a non-nullish operand can call `valueOf`/`toString`/`Symbol.toPrimitive`
// on `process.env`, which could read arbitrary keys
const same = process.env == 'x'
console.log(same)
