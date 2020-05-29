import { CREATED, NOT_FOUND } from 'http-status-codes'
import nextConnect from 'next-connect'

import { connectDB, onError, onNoMatch } from 'libs/middlewares'
import Article from 'models/article'
import Comment from 'models/comment'

const findParentArticle = async (req, res, next) => {
  req.article = await Article.findOne({ slug: req.query.slug }).select('_id')

  if (!req.article) {
    res.status(NOT_FOUND).json({
      statusCode: NOT_FOUND,
      message: `Article not found by slug: ${req.query.slug}`,
    })
  } else {
    next()
  }
}

const createComment = async (req, res) => {
  const comment = new Comment(
    Object.assign(req.body || {}, { article: req.article?._id })
  )
  await comment.save()

  res.status(CREATED).json(comment)
}

const listComments = async (req, res) => {
  const { page = 1, limit = 10, sort = '-createdAt', offset } = req.query
  const query = { article: req.article }
  const comments = await Comment.paginate(query, {
    populate: ['category'],
    limit,
    sort,
    ...(offset ? { offset } : { page }),
  })

  res.json(comments)
}

export default nextConnect({ onError, onNoMatch })
  .use(connectDB, findParentArticle)
  .post(createComment)
  .get(listComments)
