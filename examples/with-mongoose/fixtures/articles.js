const { build, fake, oneOf, perBuild } = require('@jackfranklin/test-data-bot')
const {
  Types: { ObjectId },
} = require('mongoose')
const getSlug = require('speakingurl')
const categories = require('./categories')

const articleBuilder = build({
  fields: {
    _id: perBuild(() => ObjectId()),
    title: fake((f) => f.hacker.phrase()),
    body: fake((f) => f.lorem.paragraphs(5)),
    category: oneOf(...categories),
    createdAt: fake((f) => f.date.past()),
    __v: 0,
  },
  postBuild: (article) => {
    article.slug = getSlug(article.title)
    article.abstract = article.body.split('\n \r')[0]
    article.category = article.category._id
    article.updatedAt = article.createdAt

    return article
  },
})

module.exports = Array.from({ length: 15 }, () => articleBuilder())
