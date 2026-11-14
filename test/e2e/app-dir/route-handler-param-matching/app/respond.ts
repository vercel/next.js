type Params = Record<string, string | string[] | undefined>

export function handler(method: string) {
  return async (_request: Request, { params }: { params: Promise<Params> }) => {
    const values = await params
    console.log(`handler-called:${method}:${JSON.stringify(values)}`)
    return Response.json(
      { method, params: values },
      { headers: { 'x-handler-method': method } }
    )
  }
}
