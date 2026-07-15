'use strict'

globalThis.__sharedEvaluations = (globalThis.__sharedEvaluations || 0) + 1

exports.log = []
exports.tag = 'shared'
