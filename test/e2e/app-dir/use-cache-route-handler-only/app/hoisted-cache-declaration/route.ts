const greet = formatGreeting

async function formatGreeting(name: string) {
  'use cache'

  return `Hello, ${name}!`
}

export async function GET() {
  return new Response(await greet('Ada'))
}
