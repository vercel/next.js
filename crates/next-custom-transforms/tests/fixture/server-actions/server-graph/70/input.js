// shadow the builtin Array global (used in the transform output)
const Array = {}

export async function action(x) {
  'use cache'
  return x
}
