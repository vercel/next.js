let count = 0

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (count > 0) {
      throw new Error('duplicated-register')
    }
    console.log('register-log')
    count++
  }
}
