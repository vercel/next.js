import { exitPreview } from '@prismicio/next'

export default async function exit(req, res) {
  exitPreview({ res, req })
}
