const axios = require('axios')

;(async () => {
  const { data } = await axios({
    url: 'https://dog.ceo/api/breeds/image/random',
  })
  if (data.status !== 'success') {
    throw new Error('Unexpected response: ' + JSON.stringify(data))
  }
})()
