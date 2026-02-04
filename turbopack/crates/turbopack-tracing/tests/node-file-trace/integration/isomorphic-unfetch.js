const fetch = require('isomorphic-unfetch')

;(async () => {
  const res = await fetch('https://dog.ceo/api/breeds/image/random')
  const data = await res.json()
  if (data.status !== 'success') {
    throw new Error('Unexpected response: ' + JSON.stringify(data))
  }
})()
