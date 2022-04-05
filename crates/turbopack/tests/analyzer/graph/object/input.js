// prettier-ignore
const object = { a: 1, 'b': 2, ['c']: 3 };

const a1 = object.a;
const a2 = object['a'];
const b1 = object.b;
const b2 = object['b'];
const c1 = object.c;
const c2 = object['c'];
const d1 = object.d;
const d2 = object['d'];

const object_spread = { a: 11, ...object, b: 22 };

const a3 = object_spread.a;
const b3 = object_spread.b;
const c3 = object_spread.c;
const d3 = object_spread.d;

// prettier-ignore
const { a: a4, 'b': b4, ['c']: c4, d: d4 } = object;
