const passwordless = require('passwordless')
const MemoryStore = require('passwordless-memorystore')
const email = require('emailjs')
const config = require('./config.json')

const smtpServer = email.server.connect(config.emailServer)

passwordless.init(new MemoryStore())

passwordless.addDelivery((token, uid, recipient, callback) =>
  smtpServer.send({
    text: `Welcome to Next-auth! Go to this link to login ${config.baseURL}/?token=${token}&uid=${uid}`,
    attachment: {data: `Welcome to Next-auth! Go to <a href="${config.baseURL}/?token=${token}&uid=${uid}">this link</a> to login`, alternative: true},
    from: config.email.sender,
    to: recipient,
    subject: '[Next-auth] login token'
  }, callback)
)

module.exports = passwordless
