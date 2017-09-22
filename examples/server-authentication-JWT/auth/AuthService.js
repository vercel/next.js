const jwt = require('jsonwebtoken')

const createJWT = token => {
  return jwt.sign({
    token
  }, 'secret account key')
}

const user = []

export default class AuthService {
  constructor () {
    user.push({
      name: 'Demo',
      email: 'demo@demo.com',
      password: 'demo',
      token: createJWT(123456789)
    })
  }

  logIn (email, password) {
    for (let i = 0; i < user.length; i++) {
      if (email === user[i].email) {
        return password === user[i].password ? user[i].token : false
      }
    }
    return false
  }

  createUser (name, email, password) {
    const token = createJWT('Demo')
    user.push({
      name,
      email,
      password,
      token
    })
    return token
  }
}
