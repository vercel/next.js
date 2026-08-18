const axios = require('axios')

;(async () => {
  const { status } = await axios({
    url: 'https://example.vercel.sh',
  })
  if (status !== 200) {
    throw new Error('Unexpected response: ' + JSON.stringify(data))
  }
})()
