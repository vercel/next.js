import text from './data.txt' with { type: 'text' }

export async function GET(_req) {
  return Response.json(
    {
      typeofString: typeof text === 'string',
      length: text.length,
      content: text,
    },
    { status: 200 }
  )
}
