export default function handle(req, res) {
  throw new Error('api-edge-error')
}

export const config = {
  revalidate: 0,
  runtime: 'edge',
}
