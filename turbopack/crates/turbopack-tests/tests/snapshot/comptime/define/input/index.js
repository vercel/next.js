if (DEFINED_VALUE) {
  console.log('DEFINED_VALUE')
}

if (DEFINED_TRUE) {
  console.log('DEFINED_VALUE')
}

if (!DEFINED_NULL) {
  console.log('DEFINED_NULL', DEFINED_NULL)
}

if (DEFINED_INT) {
  console.log('DEFINED_INT', DEFINED_INT)
}

if (DEFINED_FLOAT) {
  console.log('DEFINED_FLOAT', DEFINED_FLOAT)
}

if (DEFINED_ARRAY) {
  console.log('DEFINED_ARRAY', DEFINED_ARRAY)
}

if (DEFINED_EVALUATE) {
  console.log('DEFINED_EVALUATE', DEFINED_EVALUATE)
}

if (DEFINED_EVALUATE_NESTED) {
  console.log('DEFINED_EVALUATE_NESTED', DEFINED_EVALUATE_NESTED)
}

if (A.VERY.LONG.DEFINED.VALUE) {
  console.log('A.VERY.LONG.DEFINED.VALUE')
}

if (process.env.NODE_ENV) {
  console.log('something')
}

if (process.env.NODE_ENV === 'production') {
  console.log('production')
}

var p = process

console.log(A.VERY.LONG.DEFINED.VALUE)
console.log(DEFINED_VALUE)
console.log(p.env.NODE_ENV)

if (p.env.NODE_ENV === 'production') {
  console.log('production')
}

p.env.NODE_ENV == 'production'
  ? console.log('production')
  : console.log('development')

// TODO short-circuit is not implemented yet
p.env.NODE_ENV != 'production' && console.log('development')
p.env.NODE_ENV == 'production' && console.log('production')

console.log(__dirname)
