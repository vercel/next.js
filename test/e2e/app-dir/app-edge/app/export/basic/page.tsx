export default function Page() {
  if ('EdgeRuntime' in globalThis) {
    return <p>Edge!</p>
  }
  return <p>Node!</p>
}

export const runtime = 'edge'
export const preferredRegion = 'test-region'
