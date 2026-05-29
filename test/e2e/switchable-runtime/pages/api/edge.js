export default (req) => {
  return new Response(`Returned by Edge API Route ${req.url}`)
}

export const config = {
  runtime: `edge`,
}
