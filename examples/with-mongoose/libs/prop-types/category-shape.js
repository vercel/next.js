import { shape, string } from 'prop-types'

export const categoryShape = shape({
  _id: string.isRequired,
  name: string.isRequired,
  slug: string.isRequired,
})
