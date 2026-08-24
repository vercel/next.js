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
// TODO this is actually not inlined yet
console.log(INLINED3)

// TODO not tracked yet
// The re-entered object pattern now receives:
// Alternatives [
//   Argument(...),
//   process.env
// ]
// add_object_pat_effects() therefore creates DestructuredMember with that Alternatives object.
// Later, Effect::DestructuredMember calls get_definable_name(). That function does not handle JsValue::Alternatives, so it returns None instead of recognizing the process.env alternative.
// Thus FOO6 and INLINED4 remain untracked in `function readEnv({ FOO6, INLINED4 } = process.env)`.
function readEnv({ FOO6, INLINED4 } = process.env) {
  // TODO this is actually not inlined yet
  return FOO6 + INLINED4
}
console.log(readEnv())
