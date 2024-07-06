export default function handle(req, res) {
  throw new Error('api-error')
}

export const config = {
  revalidate: 0,
}
