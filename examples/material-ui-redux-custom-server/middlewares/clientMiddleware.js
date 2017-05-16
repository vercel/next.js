// https://github.com/reactjs/redux/issues/99#issuecomment-112212639
export default function clientMiddleware (client) {
  // eslint-disable-next-line no-undef
  return ({ dispatch, getState }) => (
    next => action => {
      if (typeof action === 'function') {
        return action(dispatch, getState)
      }

      const { promise, types, ...rest } = action
      if (!promise) {
        return next(action)
      }

      const [REQUEST, SUCCESS, FAILURE] = types
      next({ ...rest, type: REQUEST })
      const actionPromise = promise(client)
      actionPromise.then(
        (result) => next({ ...rest, result, type: SUCCESS }),
        (error) => next({ ...rest, error, type: FAILURE })
      ).catch((error) => {
        console.error('MIDDLEWARE ERROR:', error)
        next({ ...rest, error, type: FAILURE })
      })
      return actionPromise
    }
  )
}
