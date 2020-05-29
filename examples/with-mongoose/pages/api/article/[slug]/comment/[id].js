import { BAD_REQUEST, NOT_FOUND, NO_CONTENT } from 'http-status-codes'
import { isValidObjectId } from 'mongoose'
import nextConnect from 'next-connect'

import { connectDB, onError, onNoMatch } from 'libs/middlewares'
import Article from 'models/article'
import Comment from 'models/comment'

const checkObjectId = (req, res, next) => {
  if (!isValidObjectId(req.query.id)) {
    res.status(BAD_REQUEST).json({
      statusCode: BAD_REQUEST,
      message: `Identifier is not valid`,
    })
  } else {
    next()
  }
}

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

const findComment = async (req, res, next) => {
  req.comment = await Comment.findById(req.query.id).where({
    article: req.article,
  })

  if (!req.comment) {
    res.status(NOT_FOUND).json({
      statusCode: NOT_FOUND,
      message: `Comment not found by id: ${req.query.id}`,
    })
  } else {
    next()
  }
}

export default nextConnect({ onError, onNoMatch })
  .use(checkObjectId, connectDB, findParentArticle, findComment)
  .get(async (req, res) => {
    res.json(req.comment)
  })
  .put(async (req, res) => {
    await req.comment.updateOne(req.body || {})
    const updates = await Comment.findById(req.comment._id)

    res.json(updates)
  })
  .delete(async (req, res) => {
    await req.comment.remove()

    res.status(NO_CONTENT).send(null)
  })
