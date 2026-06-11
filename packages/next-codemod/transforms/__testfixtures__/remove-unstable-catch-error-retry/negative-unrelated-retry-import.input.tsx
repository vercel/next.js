// @ts-nocheck
/* eslint-disable */
// `unstable_retry` from an unrelated library is not the error prop; leave it.
import { unstable_retry } from 'some-library'

export default function useThing() {
  return unstable_retry()
}
