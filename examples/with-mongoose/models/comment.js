import mongoose, { Schema, Types } from 'mongoose'
import mongooseIdValidator from 'mongoose-id-validator'

const CommentSchema = new Schema(
  {
    nickname: {
      type: String,
      required: [true, 'Nickname should be defined'],
      minlength: [1, 'Nickname should not be empty'],
      maxlength: [24, 'Nickname should be less than 24 characters'],
    },
    body: {
      type: String,
      required: [true, 'Body should be defined'],
      minlength: [1, 'Body should not be empty'],
    },
    article: {
      type: Types.ObjectId,
      ref: 'Article',
      required: [true, 'Article should be defined'],
    },
  },
  { timestamps: true }
)

CommentSchema.plugin(mongooseIdValidator, { message: 'Article not found' })

CommentSchema.methods.toJSON = function () {
  const comment = this.toObject()

  return JSON.parse(JSON.stringify(comment))
}

if (
  process.env.NODE_ENV !== 'production' &&
  mongoose.modelNames().includes('Comment')
) {
  mongoose.deleteModel('Comment')
}

const Comment = mongoose.model('Comment', CommentSchema)

export default Comment
