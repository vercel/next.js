function throwError() {
  throw new Error('rsc-throw')
}

export default function Page() {
  throwError()
  return null
}
