export async function GET(_request: Request) {
  const messages = (await import('./messages')).default
  return new Response(messages.title)
}
