import nextConnect from 'next-connect'
import auth from '../../middleware/auth'

const handler = nextConnect()

handler
  .use(auth)
  .get((req, res) => {
    // For demo purpose only. You will never have an endpoint which returns all users.
    req.session.users = req.session.users || []
    res.json({ users: req.session.users })
  })
  .post((req, res) => {
    const { username, password, name } = req.body
    // Here you should check if the username has already been used
    // const user = await db.findUserByUsername(username);
    // const usernameExisted === !!user;
    const usernameExisted = req.session.users.some(
      user => user.username === username
    )
    if (usernameExisted) {
      res.status(409).send('The username has already been used')
      return
    }
    const user = { username, password, name }
    // Here you should insert the user into the database
    // await db.createUser(user);
    req.session.users.push(user)
    req.logIn(user, err => {
      if (err) throw err
      // Log the signed up user in
      res.status(201).json({
        user,
      })
    })
  })

export default handler
