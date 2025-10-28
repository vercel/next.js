export default function () {}

const dynamicPath = `/:foobar`

export const config = {
  matcher: ['/foo', dynamicPath],
}
