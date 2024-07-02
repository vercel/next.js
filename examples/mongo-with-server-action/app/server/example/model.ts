import type { IExample } from 'app/server/example/interfaces';
import type { Model } from 'mongoose';
import mongoose, { model } from 'mongoose';

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
});

export default (mongoose.models.Example || model<IExample>('Example', ExampleSchema)) as Model<IExample>;
