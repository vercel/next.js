import { authorQuery } from '../../author/[slug].js'
import { getTakeShapeData } from '../index'

export default async (req, res) => {
  const {
    query: { slug },
  } = req
  return getTakeShapeData(req, res, authorQuery(slug))
}
