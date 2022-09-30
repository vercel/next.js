export default (req) => {
  return new Response(`Hello from ${req.url}`)
}

export const config = {
  runtime: 'experimental-edge',
}
