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
    // Here you should edit the post in the database
    // const post = await db.findPostById(id);
    // if (post.userId === req.user.id)
    //  await db.updatePostById(id, content);
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
    // Here you should delete the post in the database
    // const post = await db.findPostById(id);
    // if (post.userId === req.user.id)
    //  await db.deletePostById(id);
    req.session.posts = req.session.posts.filter(post => post.id !== id)
    res.json({ posts: req.session.posts })
  })

export default handler
