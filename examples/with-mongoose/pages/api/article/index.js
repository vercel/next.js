import { CREATED } from 'http-status-codes'
import nextConnect from 'next-connect'

import { isDate } from 'libs/is-date'
import { connectDB, onError, onNoMatch } from 'libs/middlewares'
import Article from 'models/article'
import Category from 'models/category'

const createArticle = async (req, res) => {
  const article = new Article(req.body)
  await article.save()
  article.category = await Category.findOne(article.category)

  res.status(CREATED).json(article)
}

const listArticles = async (req, res) => {
  const {
    page = 1,
    limit = 10,
    sort = '-createdAt',
    category: slug,
    from,
    to,
  } = req.query
  const query = {}

  if (slug) {
    query.category = await Category.findOne({ slug })
  }
  if (isDate(from) && isDate(to)) {
    query.createdAt = { $gt: new Date(from), $lt: new Date(to) }
  }

  const articles = await Article.paginate(query, {
    populate: ['category'],
    page,
    limit,
    sort,
  })

  res.json(articles)
}

export default nextConnect({ onError, onNoMatch })
  .use(connectDB)
  .post(createArticle)
  .get(listArticles)
