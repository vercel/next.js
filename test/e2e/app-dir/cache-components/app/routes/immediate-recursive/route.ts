import { getSentinelValue } from '../../getSentinelValue'

export async function GET() {
  await new Promise<void>((resolve) => {
    setImmediate(() => {
      setImmediate(() => {
        setImmediate(resolve)
      })
    })
  })

  return Response.json({
    value: getSentinelValue(),
    message: 'recursive immediate',
  })
}
