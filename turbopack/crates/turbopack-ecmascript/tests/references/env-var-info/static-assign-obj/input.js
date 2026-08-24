// Assigning process.env
const env = process.env
if (env.FOO1 === 'x') {
  return false
}
if ('FOO2' in env) {
  return true
}

// ---

// Assigning process
const p = process
if (p.env.FOO3 === 'x') {
  return false
}
if ('FOO4' in p.env) {
  return true
}

// ---

// Assigning process with indirection
const p1 = p
if (p1.env.FOO5 === 'x') {
  return false
}
if ('FOO6' in p1.env) {
  return true
}
