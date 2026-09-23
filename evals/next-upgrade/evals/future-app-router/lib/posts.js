export const posts = [
  { id: 1, title: 'First Post', body: 'This is the first post' },
  { id: 2, title: 'Second Post', body: 'This is the second post' },
]

export async function getPosts() {
  return posts
}

export async function getPost(id) {
  return posts.find((post) => String(post.id) === String(id)) ?? null
}

export async function getComments(id) {
  return [
    {
      id: 1,
      name: 'Reader',
      body: `Comment on post ${id}`,
      email: 'reader@example.com',
    },
  ]
}
