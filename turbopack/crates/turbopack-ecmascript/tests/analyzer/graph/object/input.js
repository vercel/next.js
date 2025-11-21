// prettier-ignore
const object = { a: 1, 'b': 2, ['c']: 3 };

const a1 = object.a;
const a2 = object["a"];
const b1 = object.b;
const b2 = object["b"];
const c1 = object.c;
const c2 = object["c"];
const d1 = object.d;
const d2 = object["d"];

const object_spread = { a: 11, ...object, b: 22 };

const a3 = object_spread.a;
const b3 = object_spread.b;
const c3 = object_spread.c;
const d3 = object_spread.d;

// prettier-ignore
const { a: a4, 'b': b4, ['c']: c4, d: d4 } = object;
const { a, b, c, d } = object;

const unknown_spread = { a: 1, ...global, b: 2 };

const a5 = unknown_spread.a;
const b5 = unknown_spread.b;
const c5 = unknown_spread.c;

const object2 = { a: 1, [global]: 2, c: 3, [global]: 4, e: 5 };
const a6 = object2.a;
const b6 = object2.b;
const c6 = object2.c;
const d6 = object2.d;
const e6 = object2.e;
