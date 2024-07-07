export default function handle(req, res) {
  throw new Error('api-node-error')
}

export const config = {
  revalidate: 0,
}
