module.exports = function (collection) {
  return collection.createIndex({ slug: 1 }, { unique: true })
}
