import nextConnect from 'next-connect'
import auth from '../../middleware/auth'

const handler = nextConnect()

handler
  .use(auth)
  .get((req, res) => {
    // You do not generally want to return the whole user object
    // because it may contain sensitive field such as password. Only return what needed
    // const { name, username, favoriteColor } = req.user
    // res.json({ user: { name, username, favoriteColor } })
    res.json({ user: req.user })
  })
  .use((req, res, next) => {
    // handlers after this (PUT, DELETE) all require an authenticated user
    // This middleware to check if user is authenticated before continuing
    if (!req.user) {
      res.status(401).send('unauthenticated')
    } else {
      next()
    }
  })
  .put((req, res) => {
    const { name } = req.body
    // Here you should edit the user in the database
    // const user = await db.findUserById(req.user.id);
    // await db.updateUserById(req.user.id, { name });
    const user = req.session.users.find(
      user => user.username === req.user.username
    )
    user.name = name
    res.json({ user })
  })
  .delete((req, res) => {
    // Here you should delete the user in the database
    // await db.deleteUserById(req.user.id);
    req.session.users = req.session.users.filter(
      user => user.username !== req.user.username
    )
    req.logOut()
    res.status(204).end()
  })

export default handler
