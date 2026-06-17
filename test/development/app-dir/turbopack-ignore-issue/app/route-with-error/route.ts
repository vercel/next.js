if (Math.random() < 0) {
  require('a-missing-module-for-route-error-testing')
}

export async function GET() {
  return Response.json({ error: false })
}
