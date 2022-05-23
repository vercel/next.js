import { defineDocumentType, makeSource } from 'contentlayer/source-files'

const computedFields = {
  slug: {
    type: 'string',
    resolve: (doc) => doc._raw.sourceFileName.replace(/\.md$/, ''),
  },
}

export const Post = defineDocumentType(() => ({
  name: 'Post',
  filePathPattern: `**/*.md`,
  fields: {
    title: { type: 'string', required: true },
    date: { type: 'string', required: true },
  },
  computedFields,
}))

export default makeSource({
  contentDirPath: 'posts',
  documentTypes: [Post],
})
