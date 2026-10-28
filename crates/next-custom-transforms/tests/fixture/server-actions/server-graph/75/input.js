export const action = async function actionImpl(count) {
  'use server'

  if (count === 0) return 'done'
  return actionImpl(count - 1)
}

export const cached = async function cachedImpl(count) {
  'use cache'

  if (count === 0) return 'done'
  return cachedImpl(count - 1)
}
