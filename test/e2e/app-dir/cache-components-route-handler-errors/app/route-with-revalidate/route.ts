export const revalidate = 60

export async function GET(request: Request) {
  return new Response('route GET with revalidate')
}
