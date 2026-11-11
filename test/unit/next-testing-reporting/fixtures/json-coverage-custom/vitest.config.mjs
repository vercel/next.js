export default {
  test: {
    include: ['suite.test.mjs'],
    maxWorkers: 1,
    globalSetup: ['./setup.mjs'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['subject.mjs'],
      reporter: ['json', 'json-summary', 'lcovonly'],
      reportsDirectory: 'coverage',
      clean: false,
    },
  },
}
