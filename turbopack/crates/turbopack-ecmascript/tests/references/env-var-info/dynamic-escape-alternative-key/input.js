const key = Math.random() > 0.5 ? 'env' : 'argv'
console.log(process[key])
