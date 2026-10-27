export async function waitForRelease(id: string) {
  const origin = process.env.ROUTING_TEST_CONTROL_ORIGIN
  if (!origin) throw new Error('Missing stream control origin')
  const response = await fetch(origin + '/' + encodeURIComponent(id), {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error('Stream control request failed')
  await response.text()
}
