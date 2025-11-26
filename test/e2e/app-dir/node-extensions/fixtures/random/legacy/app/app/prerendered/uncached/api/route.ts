export const revalidate = 1

export function GET() {
  const response = JSON.stringify({
    rand1: Math.random(),
    rand2: Math.random(),
  })
  return new Response(response, {
    headers: {
      'content-type': 'application/json',
    },
  })
}
