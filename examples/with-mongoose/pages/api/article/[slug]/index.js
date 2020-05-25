import { NOT_FOUND, NO_CONTENT } from 'http-status-codes'
import nextConnect from 'next-connect'

import { connectDB, onError, onNoMatch } from 'libs/middlewares'
import Article from 'models/article'

const getOneArticle = async (req, res) => {
  const { slug } = req.query
  const article = await Article.findOne({ slug }).populate('category')

  if (!article) {
    res.status(NOT_FOUND).json({
      statusCode: NOT_FOUND,
      message: `Article not found by slug: ${slug}`,
    })
  } else {
    res.json(article)
  }
}

const updateOneArticle = async (req, res) => {
  const { slug } = req.query
  let article = await Article.findOne({ slug }).populate('category')

  if (!article) {
    res.status(NOT_FOUND).json({
      statusCode: NOT_FOUND,
      message: `Article not found by slug: ${slug}`,
    })
  } else {
    await article.updateOne(req.body)
    article = await Article.findOne({ _id: article._id }).populate('category')

    res.json(article)
  }
}

const deleteOneArticle = async (req, res) => {
  const { slug } = req.query
  const article = await Article.findOne({ slug })

  if (!article) {
    res.status(NOT_FOUND).json({
      statusCode: NOT_FOUND,
      message: `Article not found by slug: ${slug}`,
    })
  } else {
    await article.remove()

    res.status(NO_CONTENT).send(null)
  }
}

export default nextConnect({ onError, onNoMatch })
  .use(connectDB)
  .get(getOneArticle)
  .put(updateOneArticle)
  .delete(deleteOneArticle)
