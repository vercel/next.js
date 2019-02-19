const functions = require('firebase-functions')
const indexPage = require('./next/serverless/pages/index')
const loginPage = require('./next/serverless/pages/login')

exports.IndexPage = functions.https.onRequest((req, res) => indexPage.render(req, res))
exports.LoginPage = functions.https.onRequest((req, res) => loginPage.render(req, res))
