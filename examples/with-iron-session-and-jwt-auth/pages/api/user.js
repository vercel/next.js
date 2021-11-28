import checkExpired from '../../lib/checkExpired';
import refreshAuthToken from '../../lib/refreshToken';
import withSession from '../../lib/session'

export default withSession(async (req, res) => {
  const user = req.session.get('user')
  const aTIndex = process.env.ACCESS_TOKEN_INDEX_IN_SERVER_AUTH_JSON_RESPONSE
  const rtIndex = process.env.REFRESH_TOKEN_INDEX_IN_SERVER_AUTH_JSON_RESPONSE
  if (user) {
    // in a real world application you might read the user id from the session and then do a database request
    // to get more information on the user if needed
    if (checkExpired(user[aTIndex])) {
      // Get new access/auth token
      const newAccessToken = (await refreshAuthToken(user[rtIndex]))[aTIndex]
      // Remove old access/auth token and store in cookie
      let oldUser = user
      delete oldUser[aTIndex]
      const newUser = { ...oldUser, [aTIndex]: newAccessToken }
      await req.session.set('user', newUser)
      await req.session.save()
      // Send back the updated user data
      const savedUser = await req.session.get('user')
      res.json({
        isLoggedIn: true,
        ...savedUser,
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
