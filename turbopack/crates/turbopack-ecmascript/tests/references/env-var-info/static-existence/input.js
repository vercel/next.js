if ('FOO1' in process.env) {
  return true
}
if ('INLINED1' in process.env) {
  return true
}

if (process.env.FOO2) {
  return true
}
if (process.env.INLINED2) {
  return true
}

const a = !process.env.FOO3
const b = !process.env.INLINED3

const c = Boolean(process.env.FOO4)
const d = Boolean(process.env.INLINED4)

const e = something(process.env.FOO_FN_READ5)

function shadowed(Boolean) {
  return Boolean(process.env.FOO_SHADOWED_READ6)
}

const g = !process.env.FOO_COMPOUND1 || !process.env.FOO_COMPOUND2
const h = process.env.FOO_COMPOUND_READ1 || process.env.FOO_COMPOUND_READ2

if (process.env.FOO_COMPOUND3 || process.env.FOO_COMPOUND4) {
  return true
}

const i = process.env.FOO_COMPOUND_READ3 ?? process.env.FOO_COMPOUND_READ4

if (process.env.FOO_COMPOUND5 ?? process.env.FOO_COMPOUND6) {
  return true
}

const j = process.env.FOO_AND_READ1 && process.env.FOO_AND_READ2

if (process.env.FOO_AND1 && process.env.FOO_AND2) {
  return true
}

if (
  (process.env.FOO_NESTED1 || process.env.FOO_NESTED2) &&
  process.env.FOO_NESTED3
) {
  return true
}

if (process.env.FOO_PAREN) {
  return true
}

const k = Boolean(other, process.env.FOO_BOOLEAN_EXTRA_READ)
const l = Boolean(...process.env.FOO_BOOLEAN_SPREAD_READ)

const m = process.env.FOO_TERNARY_TEST ? 'yes' : 'no'

if (condition ? process.env.FOO_TERNARY1 : process.env.FOO_TERNARY2) {
  return true
}

const n = condition
  ? process.env.FOO_TERNARY_READ1
  : process.env.FOO_TERNARY_READ2

if (process.env.FOO_READ_DOMINATES) {
  return true
}
console.log(process.env.FOO_READ_DOMINATES)

if (process.env.FOO_BOTH) {
  console.log(process.env.FOO_BOTH)
}
