/// <reference types="./on-commit-action-parse.d.ts" />
import { ON_COMMIT_ACTIONS } from '../operation-node/create-table-node.js'
export function parseOnCommitAction(action) {
  if (ON_COMMIT_ACTIONS.includes(action)) {
    return action
  }
  throw new Error(`invalid OnCommitAction ${action}`)
}
