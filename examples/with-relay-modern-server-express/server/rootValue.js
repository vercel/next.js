const gqr = require('graphql-relay')
const db = require('./db')
const viewer = variables => ({
  allBlogPosts: gqr.connectionFromArray(db.blogPosts, variables)
})

module.exports = { viewer }
