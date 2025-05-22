export async function GET(_request: Request) {
  const messages = (await import('./async-messages')).default
  return new Response(messages.title)
}
