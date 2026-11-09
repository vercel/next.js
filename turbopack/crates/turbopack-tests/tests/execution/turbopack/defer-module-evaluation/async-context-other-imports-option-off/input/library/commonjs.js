globalThis.deferEvents.push('commonjs')

exports.atEvaluation = globalThis.deferRequest.getStore()
