module.exports = () => {
  return {
    env: {
      // Enable API mocking in development only.
      enableApiMocking: process.env.NODE_ENV === 'development',
    },
  }
}
