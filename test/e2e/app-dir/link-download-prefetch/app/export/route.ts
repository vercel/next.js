export async function GET() {
  return new Response('id,name\n1,Next.js\n', {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment',
    },
  })
}
