export default function handle(req, res) {
  throw new Error('api-error-edge')
}

export const config = {
  revalidate: 0,
  runtime: 'edge',
}
