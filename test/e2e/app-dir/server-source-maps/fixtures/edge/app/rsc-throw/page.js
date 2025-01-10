function throwError() {
  throw new Error('Boom')
}

export default function Page() {
  throwError()
  return null
}
