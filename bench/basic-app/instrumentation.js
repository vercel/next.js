export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const keyv = require('keyv')
    console.log('keyv', keyv)
  }
}
