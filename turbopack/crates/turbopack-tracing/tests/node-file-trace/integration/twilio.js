const twilio = require('twilio')
try {
  twilio()
} catch (err) {
  if (!/username is required/.test(err.message)) {
    throw err
  }
}
