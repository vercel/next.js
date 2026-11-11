export default {
  test: {
    include: ['contract.case.mjs'],
    maxWorkers: 1,
    coverage: {
      enabled: true,
      provider: 'custom',
      customProviderModule: './coverage-provider.mjs',
      reportOnFailure: true,
    },
  },
}
