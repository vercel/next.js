export const config = {
  runtime: 'edge',
}
export default function handler(req, res) {
  throw new Error('foobar')
}
