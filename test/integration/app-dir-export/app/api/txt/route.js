export const revalidate = false

export async function GET() {
  return new Response('this is plain text')
}
