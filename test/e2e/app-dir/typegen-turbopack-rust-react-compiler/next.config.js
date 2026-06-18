const { PHASE_PRODUCTION_BUILD } = require('next/constants')

module.exports = (phase) => {
  if (phase !== PHASE_PRODUCTION_BUILD) {
    throw new Error(`Unexpected phase: ${phase}`)
  }

  return {
    experimental: {
      turbopackRustReactCompiler: true,
    },
    reactCompiler: true,
  }
}
