export default function handle(req, res) {
  throw new Error('api-edge-error')
}

export const runtime = 'edge'
export const revalidate = 0
