/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Cache Components enables the dev validation this benchmark stresses.
  cacheComponents: true,
}

// The benchmark runner A/Bs worker vs in-process validation on the same build
// by setting this env var. We only set the experimental flag when explicitly
// disabling the worker; leaving it unset uses the default (worker), so the two
// configurations differ in this one flag alone.
if (process.env.BENCH_DEV_VALIDATION_WORKER === 'false') {
  nextConfig.experimental = {
    ...nextConfig.experimental,
    devValidationWorker: false,
  }
}

module.exports = nextConfig
