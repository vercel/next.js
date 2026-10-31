'use server'

export const qux = async function wrongId1() {
  return 'exported named function expression'
}

const local = async function wrongId2() {
  return 'aliased named function expression'
}

export { local as aliased }

const defaultAction = async function wrongId3() {
  return 'default exported named function expression'
}

export default defaultAction
