import nextConnect from 'next-connect'
import auth from '../../../middleware/auth'
import nanoid from 'nanoid'

const handler = nextConnect()

handler
  .use(auth)
  .get((req, res) => {
    if (!req.user) res.json({ posts: [] })
    // Here you will read all posts to the database
    // db.findPostsByUserId(req.user.id, post)
    // We will use req.session for demo purpose
    res.json({ posts: req.session.posts })
  })
  .post((req, res) => {
    const { content } = req.body
    if (!req.user) {
      res.status(401).send('unauthenticated')
      return
    }
    const post = {
      id: nanoid(),
      content,
    }
    // Here you will add the posts to the database
    // db.createPost(req.user.id, post)
    // We will use req.session for demo purpose
    req.session.posts = req.session.posts.concat([post])
    res.json({ posts: req.session.posts })
  })

export default handler
