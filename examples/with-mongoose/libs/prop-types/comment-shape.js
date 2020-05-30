import { shape, string } from 'prop-types'

export const commentShape = shape({
  _id: string.isRequired,
  body: string.isRequired,
  nickname: string.isRequired,
  createdAt: string.isRequired,
  updatedAt: string.isRequired,
})
