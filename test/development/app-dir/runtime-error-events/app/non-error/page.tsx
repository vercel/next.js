'use client'
export default function Page() {
  // eslint-disable-next-line no-throw-literal -- Exercise normalization of user-thrown values.
  throw 'non-Error render failed'
}
