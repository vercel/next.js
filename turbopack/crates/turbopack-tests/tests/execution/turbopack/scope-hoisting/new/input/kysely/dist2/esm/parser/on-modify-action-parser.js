/// <reference types="./on-modify-action-parser.d.ts" />
import { ON_MODIFY_FOREIGN_ACTIONS } from '../operation-node/references-node.js'
export function parseOnModifyForeignAction(action) {
  if (ON_MODIFY_FOREIGN_ACTIONS.includes(action)) {
    return action
  }
  throw new Error(`invalid OnModifyForeignAction ${action}`)
}
