import { CREATED } from 'http-status-codes'
import nextConnect from 'next-connect'

import { connectDB, onError, onNoMatch } from 'libs/middlewares'
import Category from 'models/category'

const createCategory = async (req, res) => {
  const category = new Category(req.body)
  await category.save()

  res.status(CREATED).json(category)
}

const listCategories = async (req, res) => {
  const categories = await Category.find()

  res.json(categories)
}

export default nextConnect({ onError, onNoMatch })
  .use(connectDB)
  .post(createCategory)
  .get(listCategories)
