import { postListQuery } from '../../posts'
import { getTakeShapeData } from '../index'

export default async (req, res) => {
  return getTakeShapeData(req, res, postListQuery)
}
