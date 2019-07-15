export default function contentFetcher(route) {
  return fetch(route, {
    headers: {
      'content-type': 'application/json',
    },
  })
    .then(res => {
      if (!res.ok) {
        throw new Error('failed to get data got status: ' + res.status)
      }
      return res.json()
    })
    .catch(error => {
      return { error }
    })
}
