import type { Model } from 'mongoose'
import mongoose, { model } from 'mongoose'

export interface IExample {
  title: string
  description: string
}

const ExampleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a title'],
    maxlength: [60, 'Title cannot be more than 60 characters'],
  },
  description: {
    type: String,
    required: [true, 'Please provide a description'],
  },
})

export default (mongoose.models.Example ||
  model<IExample>('Example', ExampleSchema)) as Model<IExample>
