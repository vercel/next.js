globalThis.deferEvents.push('throws')

function throwAtEvaluation() {
  throw new Error(
    'thrown by throws.js in ' + globalThis.deferRequest.getStore()
  )
}

throwAtEvaluation()

export const never = 'never'
