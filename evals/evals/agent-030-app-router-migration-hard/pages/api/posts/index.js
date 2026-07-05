export default function handler(req, res) {
  if (req.method === 'GET') {
    // Simulate fetching posts
    const posts = [
      { id: 1, title: 'First Post', content: 'This is the first post' },
      { id: 2, title: 'Second Post', content: 'This is the second post' },
    ]

    res.status(200).json(posts)
  } else if (req.method === 'POST') {
    const { title, content } = req.body

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' })
    }

    // Simulate creating a post
    const newPost = {
      id: Date.now(),
      title,
      content,
      createdAt: new Date().toISOString(),
    }

    res.status(201).json(newPost)
  } else {
    res.setHeader('Allow', ['GET', 'POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
