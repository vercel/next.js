import nextConnect from 'next-connect'
import auth from '../../../middleware/auth'

const handler = nextConnect()

handler
  .use(auth)
  .put((req, res) => {
    if (!req.user) {
      res.status(401).send('unauthenticated')
      return
    }
    const { id } = req.query
    const { content } = req.body
    // Here you will edit the post in the database
    // db.updatePostByIdAndUserId(id, req.user.id, content);
    // We will use req.session for demo purpose
    const editingPost = req.session.posts.find(post => post.id === id)
    editingPost.content = content
    res.json({ posts: req.session.posts })
  })
  .delete((req, res) => {
    if (!req.user) {
      res.status(401).send('unauthenticated')
      return
    }
    const { id } = req.query
    // Here you will edit the post in the database
    // db.deletePostByIdAndUserId(id, req.user.id, content);
    // We will use req.session for demo purpose
    req.session.posts = req.session.posts.filter(post => post.id !== id)
    res.json({ posts: req.session.posts })
  })

export default handler
