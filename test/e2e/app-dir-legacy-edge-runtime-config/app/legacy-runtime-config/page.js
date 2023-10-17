/*global globalThis*/

export default function Page() {
  if ('EdgeRuntime' in globalThis) {
    return <p>Edge!</p>
  }
  return <p>Node!</p>
}

export const config = {
  runtime: 'edge',
  regions: ['us-east-1'],
}
