// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

export default function helloAPI(req, res) {
  res.statusCode = 200
  res.json({ name: 'John Doe' })
}
