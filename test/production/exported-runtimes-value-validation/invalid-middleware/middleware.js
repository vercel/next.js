export default function () {}

function getDynamicPath() {
  return `/:foobar`
}

export const config = {
  matcher: ['/foo', getDynamicPath()],
}
