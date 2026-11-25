// None of the keys is `env`
const key = Math.random() > 0.5 ? 'argv' : 'version'
console.log(process[key])
const { [key]: value } = process
console.log(value)
console.log(process.env.valueOf.length, process.env.FOO1)
