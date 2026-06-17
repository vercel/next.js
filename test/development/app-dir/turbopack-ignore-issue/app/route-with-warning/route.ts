export async function GET() {
  let missing = null
  try {
    missing = require('a-missing-module-for-route-warning-testing')
  } catch (e) {
    // expected
  }
  return Response.json({ warning: true, missing: String(missing) })
}
