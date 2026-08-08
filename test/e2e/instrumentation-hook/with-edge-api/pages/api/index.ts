export default function handler() {
  return new Response(
    'API Edge instrumentationFinished=' +
      (globalThis as any).instrumentationFinished
  )
}

export const config = {
  runtime: 'edge',
}
