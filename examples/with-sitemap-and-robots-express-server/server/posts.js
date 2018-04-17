const posts = () => {
  const arrayOfPosts = []
  const n = 5

  for (let i = 1; i < n + 1; i += 1) {
    arrayOfPosts.push({ name: `Post ${i}`, slug: `post-${i}` })
  }
  return arrayOfPosts
}

module.exports = posts
