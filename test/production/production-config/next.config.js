module.exports = {
  env: {
    ...(process.env.ENABLE_ENV_FAIL_UNDERSCORE
      ? {
          __NEXT_MY_VAR: 'test',
        }
      : {}),
    ...(process.env.ENABLE_ENV_FAIL_NODE
      ? {
          NODE_ENV: 'abc',
        }
      : {}),
    ...(process.env.ENABLE_ENV_WITH_UNDERSCORES
      ? {
          SOME__ENV__VAR: '123',
        }
      : {}),
    ...(process.env.ENABLE_ENV_NEXT_PRESERVED
      ? {
          NEXT_RUNTIME: 'nodejs',
        }
      : {}),
  },
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  async generateBuildId() {
    return 'custom-buildid'
  },
}
