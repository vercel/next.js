const fetch = require('isomorphic-unfetch')

;(async () => {
  const { status } = await fetch('https://example.vercel.sh')
  if (status !== 200) {
    throw new Error(`Unexpected status: ${status}`)
  }
})()
