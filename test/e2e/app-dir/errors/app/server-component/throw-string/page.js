export const revalidate = 0

export default function Page() {
  // eslint-disable-next-line no-throw-literal -- testing bad values on purpose
  throw 'this is a test'
}
