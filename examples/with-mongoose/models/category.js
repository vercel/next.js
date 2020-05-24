import mongoose, { Schema } from 'mongoose'
import mongooseSlugUpdater from 'mongoose-slug-updater'
import mongooseUniqueValidator from 'mongoose-unique-validator'

const CategorySchema = new Schema({
  name: {
    type: String,
    required: [true, 'Name should be defined'],
    min: [1, 'Name should not be empty'],
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
    slug: 'name',
  },
})

CategorySchema.plugin(mongooseUniqueValidator, { message: 'already exists' })
CategorySchema.plugin(mongooseSlugUpdater)
CategorySchema.methods.toJSON = function () {
  const category = this.toObject()

  return JSON.parse(JSON.stringify(category))
}

if (
  process.env.NODE_ENV !== 'production' &&
  mongoose.modelNames().includes('Category')
) {
  mongoose.deleteModel('Category')
}

const Category = mongoose.model('Category', CategorySchema)

export default Category
