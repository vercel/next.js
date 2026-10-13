// 'some-lib' is aliased to `false` in next.config.js.
// require() should resolve to `{}`.
const mod = require('some-lib')

export function GET() {
  return Response.json({
    required: mod,
  })
}
