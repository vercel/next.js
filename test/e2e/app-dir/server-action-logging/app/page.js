import ActionButtons from './action-buttons'
import {
  successAction,
  multiArgAction,
  redirectAction,
  notFoundAction,
  errorAction,
  objectArgAction,
  arrayArgAction,
  inlineAction,
  promiseArgAction,
} from './actions'

export default function Page() {
  return (
    <ActionButtons
      successAction={successAction}
      multiArgAction={multiArgAction}
      redirectAction={redirectAction}
      notFoundAction={notFoundAction}
      errorAction={errorAction}
      objectArgAction={objectArgAction}
      arrayArgAction={arrayArgAction}
      inlineAction={inlineAction}
      promiseArgAction={promiseArgAction}
    />
  )
}
