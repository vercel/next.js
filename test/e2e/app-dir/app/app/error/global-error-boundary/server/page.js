export default function Page() {
  const e = new Error('this is a test')
  e.digest = 'CUSTOM_DIGEST_SERVER'
  throw e
}
