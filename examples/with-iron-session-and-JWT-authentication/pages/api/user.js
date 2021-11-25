import checkExpired from '../../lib/checkExpired';
import refreshToken from '../../lib/refreshToken';
import withSession from '../../lib/session'

export default withSession(async (req, res) => {
  const user = req.session.get('user')
  const accessToken = process.env.ACCESS_TOKEN_INDEX_IN_SERVER_JSON_RESPONSE
  console.log("USER API");
  if (user) {
    // in a real world application you might read the user id from the session and then do a database request
    // to get more information on the user if needed
    if (checkExpired(user[accessToken])) {
      // Get new access/auth token
      newAccessToken = refreshToken(user.refreshToken)
      // Remove old access/auth token and store in cookie
      let oldUser = user
      delete oldUser[accessToken]
      newUser = { ...oldUser, [accessToken]: newAccessToken }
      req.session.set('user', newUser)
      // Send back the response
      const user = req.session.get('user')
      res.json({
        isLoggedIn: true,
        ...user,
      })
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
