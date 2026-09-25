import { lang } from 'next/root-params'

export async function readConditional() {
  'use cache'
  if (process.env.__ROOT_PARAM_METADATA_TEST_BRANCH__) {
    return lang()
  }
  return 'constant'
}
