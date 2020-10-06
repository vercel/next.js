const bodyParser = (req) =>
  new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      const requestBody = JSON.parse(data || '{}')
      resolve(requestBody)
    })
  })

export { bodyParser }
