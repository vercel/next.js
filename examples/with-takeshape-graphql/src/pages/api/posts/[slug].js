import { postQuery } from '../../posts/[slug].js'
import { getTakeShapeData } from '../index'

export default async (req, res) => {
  const {
    query: { slug },
  } = req
  return getTakeShapeData(req, res, postQuery(slug))
}
