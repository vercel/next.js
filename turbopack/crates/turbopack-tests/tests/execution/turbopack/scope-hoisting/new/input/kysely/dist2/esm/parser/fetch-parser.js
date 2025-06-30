/// <reference types="./fetch-parser.d.ts" />
import { FetchNode } from '../operation-node/fetch-node.js'
import { isBigInt, isNumber } from '../util/object-utils.js'
export function parseFetch(rowCount, modifier) {
  if (!isNumber(rowCount) && !isBigInt(rowCount)) {
    throw new Error(`Invalid fetch row count: ${rowCount}`)
  }
  if (!isFetchModifier(modifier)) {
    throw new Error(`Invalid fetch modifier: ${modifier}`)
  }
  return FetchNode.create(rowCount, modifier)
}
function isFetchModifier(value) {
  return value === 'only' || value === 'with ties'
}
