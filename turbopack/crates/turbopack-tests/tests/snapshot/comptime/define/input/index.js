if (DEFINED_VALUE) {
  console.log('DEFINED_VALUE');
}

if (DEFINED_TRUE) {
  console.log('DEFINED_VALUE');
}

if (A.VERY.LONG.DEFINED.VALUE) {
  console.log('A.VERY.LONG.DEFINED.VALUE');
}

if (process.env.NODE_ENV) {
  console.log('something');
}

if (process.env.NODE_ENV === 'production') {
  console.log('production');
}

var p = process;

console.log(A.VERY.LONG.DEFINED.VALUE);
console.log(DEFINED_VALUE);
console.log(p.env.NODE_ENV);

if (p.env.NODE_ENV === 'production') {
  console.log('production');
}

p.env.NODE_ENV == 'production' ? console.log('production') : console.log('development');

// TODO short-circuit is not implemented yet
p.env.NODE_ENV != 'production' && console.log('development');
p.env.NODE_ENV == 'production' && console.log('production');
