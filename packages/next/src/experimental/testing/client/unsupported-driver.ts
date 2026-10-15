export function browser(): never {
  throw new Error(
    'Next application browser drivers require the ordinary browser profile without browser.enabled. This explicit client page is the test realm.'
  )
}
