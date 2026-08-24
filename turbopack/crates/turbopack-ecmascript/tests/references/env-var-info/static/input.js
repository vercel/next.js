if (process.env.FOO1 === 'x') {
  return false
}
if (process.env.INLINED1 === 'x') {
  return false
}

if ('FOO2' in process.env) {
  return true
}
if ('INLINED2' in process.env) {
  return true
}

const NAME = 'FOO3'
console.log(process.env[NAME])

const { FOO4, ['FOO5']: renamed, INLINED3 } = process.env
console.log(FOO4, renamed)
// TODO this actually not inlined yet
console.log(INLINED3)
