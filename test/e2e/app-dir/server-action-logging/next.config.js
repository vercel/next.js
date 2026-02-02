module.exports = {
  logging:
    process.env.NEXT_TEST_SERVER_FUNCTION_LOGGING === 'true'
      ? { serverFunctions: true }
      : undefined,
}
