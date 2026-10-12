export async function readRequire() {
  'use cache'
  require('./root-helper')
  return 'constant'
}
