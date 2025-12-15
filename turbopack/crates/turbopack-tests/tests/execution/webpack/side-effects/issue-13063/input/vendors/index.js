import uuid from './uuid'
import { checkIsNonemptyString } from './types'
export { UiSelectButton } from './select'
export { UiSelectButton2 } from './select2'

export function UiButton() {
  checkIsNonemptyString()
  uuid()
}
