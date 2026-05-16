export default function handler(req, res) {
  const { id } = req.query

  if (req.method === 'GET') {
    // Simulate fetching a single post
    const post = {
      id: parseInt(id),
      title: `Post ${id}`,
      content: `This is the content for post ${id}`,
      createdAt: new Date().toISOString(),
    }

    res.status(200).json(post)
  } else if (req.method === 'PUT') {
    const { title, content } = req.body

    // Simulate updating a post
    const updatedPost = {
      id: parseInt(id),
      title: title || `Post ${id}`,
      content: content || `Updated content for post ${id}`,
      updatedAt: new Date().toISOString(),
    }

    res.status(200).json(updatedPost)
  } else if (req.method === 'DELETE') {
    // Simulate deleting a post
    res.status(200).json({ message: `Post ${id} deleted successfully` })
  } else {
    res.setHeader('Allow', ['GET', 'PUT', 'DELETE'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
