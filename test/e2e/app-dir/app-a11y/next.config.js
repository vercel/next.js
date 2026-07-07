module.exports = {
  experimental: {
    // TODO: The route-announcer test asserts on the pre-`optimisticRouting`
    // title-change timing. Pin the fixture to the old default until the
    // test is updated (or until the flag is removed).
    optimisticRouting: false,
  },
}
