import { NOT_FOUND, NO_CONTENT } from 'http-status-codes'
import nextConnect from 'next-connect'

import { connectDB, onError, onNoMatch } from 'libs/middlewares'
import Category from 'models/category'

const getOneCategory = async (req, res) => {
  const { slug } = req.query
  const category = await Category.findOne({ slug })

  if (!category) {
    res.status(NOT_FOUND).json({
      statusCode: NOT_FOUND,
      message: `Category not found by slug: ${slug}`,
    })
  } else {
    res.json(category)
  }
}

const updateOneCategory = async (req, res) => {
  const { slug } = req.query
  let category = await Category.findOne({ slug })

  if (!category) {
    res.status(NOT_FOUND).json({
      statusCode: NOT_FOUND,
      message: `Category not found by slug: ${slug}`,
    })
  } else {
    await category.updateOne(req.body)
    category = await Category.findOne({ _id: category._id })

    res.json(category)
  }
}

const deleteOneCategory = async (req, res) => {
  const { slug } = req.query
  const category = await Category.findOne({ slug })

  if (!category) {
    res.status(NOT_FOUND).json({
      statusCode: NOT_FOUND,
      message: `Category not found by slug: ${slug}`,
    })
  } else {
    await category.remove()

    res.status(NO_CONTENT).send(null)
  }
}

export default nextConnect({ onError, onNoMatch })
  .use(connectDB)
  .get(getOneCategory)
  .put(updateOneCategory)
  .delete(deleteOneCategory)
