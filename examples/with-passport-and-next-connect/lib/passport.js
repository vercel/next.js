import passport from 'passport'
import LocalStrategy from 'passport-local'

passport.serializeUser(function(user, done) {
  // In practice, we do not serialize the whole user object but just the id
  // done(null, user.id)
  done(null, user)
})

passport.deserializeUser(function(id, done) {
  // In practice, id will just be an id, but it is the whole user object in this case
  // Otherwise, id would be used to query the database
  // db.findUserById(id).then((user) => {
  //  done(null, user);
  // });
  done(null, id)
})

passport.use(
  new LocalStrategy((username, password, done) => {
    // Here you should lookup for the user in your DB and compare the password
    // const user = await db.findUserByUsername(username)
    // const hash = await argon2.hash(password);
    // const passwordsMatch = user.hash === hash
    if (password === 'hackme') {
      done(null, { username })
    } else {
      // return null if the password is incorrect
      done(null, null)
    }
  })
)

export default passport
