// A destructuring assignment evaluates to its source, so this hands out all of `process.env`
let FOO1
consume(({ FOO1 } = process.env))
