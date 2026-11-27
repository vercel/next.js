export function ActionBeforeCapturedInit() {
  const ref = runAction
  let a = 2
  return ref

  async function runAction() {
    'use server'

    return a
  }
}
