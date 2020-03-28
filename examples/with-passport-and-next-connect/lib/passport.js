import passport from 'passport'
import LocalStrategy from 'passport-local'

passport.serializeUser(function(user, done) {
  done(null, user.username)
})

passport.deserializeUser(function(req, id, done) {
  // Here you find the user based on id in the database
  // db.findUserById(id).then((user) => {
  //  done(null, user);
  // });
  const user = req.session.users.find(user => user.username === id)
  done(null, user)
})

passport.use(
  new LocalStrategy(
    { passReqToCallback: true },
    (req, username, password, done) => {
      // Here you should lookup for the user in your DB and compare the password
      // const user = await db.findUserByUsername(username)
      // const hash = await argon2.hash(password);
      // const passwordsMatch = user.hash === hash
      const user = req.session.users.find(user => user.username === username)
      if (!user || user.password !== password) {
        done(null, null)
      } else {
        done(null, user)
      }
    }
  )
)

export default passport
