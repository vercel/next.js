const key = Math.random() > 0.5 ? 'env' : 'argv'
const { [key]: value } = process
console.log(value)
