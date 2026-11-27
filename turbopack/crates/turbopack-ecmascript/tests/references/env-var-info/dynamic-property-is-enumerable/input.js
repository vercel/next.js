const key = Math.random() > 0.5 ? 'FOO1' : String(Math.random())
console.log(process.env.propertyIsEnumerable(key))
