import { shape, string } from 'prop-types'

import { categoryShape } from './category-shape'

export const articleShape = shape({
  _id: string.isRequired,
  title: string.isRequired,
  slug: string.isRequired,
  abstract: string.isRequired,
  body: string.isRequired,
  category: categoryShape.isRequired,
  cover: shape({
    url: string.isRequired,
    alt: string,
  }),
  createdAt: string,
  updatedAt: string,
})
