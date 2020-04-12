import Router from 'next/router'

export const signOut = async () => {
  try {
    const auth2 = await window.gapi.auth2.init({
      client_id: process.env.google_client_id,
    })
    await auth2.signOut()
    Router.push('/')
  } catch (e) {
    console.error(e)
  }
}

export const fetchWithToken = (url, token) =>
  fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
    .then(r => r.json())
    .catch(e => console.error(e))

export const fetcher = url => fetch(url).then(r => r.json())
