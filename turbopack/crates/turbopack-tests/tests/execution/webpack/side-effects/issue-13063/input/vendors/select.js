import uuid from './uuid'
import { checkIsNonemptyString } from './types'

export function UiSelectButton() {
  checkIsNonemptyString()
  uuid()
}

console.log.bind(console)
