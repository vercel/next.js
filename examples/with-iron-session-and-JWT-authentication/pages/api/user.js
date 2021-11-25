import checkExpired from '../../lib/checkExpired';
import withSession from '../../lib/session'

export default withSession(async (req, res) => {
  const user = req.session.get('user')
  console.log("USER API");
  if (user) {
    // in a real world application you might read the user id from the session and then do a database request
    // to get more information on the user if needed
    if (checkExpired(user.authToken)) {
      
    } else {
      res.json({
        isLoggedIn: true,
        ...user,
      })
    }
  } else {
    res.json({
      isLoggedIn: false,
    })
  }
})
