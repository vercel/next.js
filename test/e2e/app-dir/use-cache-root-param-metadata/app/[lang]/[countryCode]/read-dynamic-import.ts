export async function readDynamicImport() {
  'use cache'
  await import('./root-helper')
  return 'constant'
}
