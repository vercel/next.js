import { parse } from 'url'
import PDFParser from 'pdf2json'

export default function (req, res) {
  const { query } = parse(req.url, true)
  const { name = 'World' } = query
  res.end(`Hello ${name}!`)
}
