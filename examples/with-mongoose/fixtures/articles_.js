module.exports = function (collection) {
  collection.createIndex({ title: 1 }, { unique: false })
  collection.createIndex({ slug: 1 }, { unique: true })
}
