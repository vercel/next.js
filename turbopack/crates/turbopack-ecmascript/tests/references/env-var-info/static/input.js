if (process.env.FOO1 === 'x') {
  return false
}
if (process.env.INLINED1 === 'x') {
  return false
}

const NAME = 'FOO2'
console.log(process.env[NAME])

const { FOO3, ['FOO4']: renamed, INLINED2 } = process.env
console.log(FOO3, renamed)
// TODO this is actually not inlined yet
console.log(INLINED2)

function readEnv({ FOO5, INLINED4 } = process.env) {
  // TODO this is actually not inlined yet
  return FOO5 + INLINED4
}
console.log(readEnv())
