const fetch = require('isomorphic-unfetch')

module.exports = {
  async exportPathMap () {
    // we fetch our list of posts, this allow us to dynamically generate the exported pages
    const response = await fetch('https://jsonplaceholder.typicode.com/posts?_page=1')
    const postList = await response.json()

    // tranform the list of posts into a map of pages with the pathname `/post/:id`
    const pages = postList.reduce(
      (pages, post) =>
        Object.assign({}, pages, {
          [`/post/${post.id}`]: {
            page: '/post',
            query: { id: post.id }
          }
        }),
      {},
    )

    // combine the map of post pages with the home
    return Object.assign({}, pages, {
      '/': { page: '/' }
    })
  }
}
