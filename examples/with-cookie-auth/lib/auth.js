import Router from 'next/router'
import axios from 'axios'

axios.defaults.withCredentials = true

const WINDOW_USER_SCRIPT_VARIABLE = `__USER__`

const decode = ({token}) => {
  if (!token) {
    return {}
  }
  const {email, type} = token || {}
  return {user: {email, type}}
}

export const getUserScript = (user) => {
  const json = JSON.stringify(user)
  return `${WINDOW_USER_SCRIPT_VARIABLE} = ${json};`
}

export const getServerSideToken = (req) => {
  const {signedCookies} = req

  if (!signedCookies) {
    return {}
  }
  try {
    return decode(signedCookies)
  } catch (parseError) {
    return {}
  }
}

export const getClientSideToken = () => {
  if (typeof window !== 'undefined') {
    const user = window[WINDOW_USER_SCRIPT_VARIABLE] || {}
    return {user}
  }
  return {user: {}}
}

const getRedirectPath = (userType) => {
  switch (userType) {
    case 'authenticated':
      return '/profile'
    default:
      return '/login'
  }
}

const redirect = (res, path) => {
  if (res) {
    res.redirect(302, path)
    res.finished = true
    return {}
  }
  Router.replace(path)
  return {}
}

export const authInitialProps = (redirectIfAuth, secured) => async ({req, res}) => {
  const auth = req ? getServerSideToken(req) : getClientSideToken()
  const current = req ? req.url : window.location.pathname
  const user = auth.user
  const isAnonymous = !user || user.type !== 'authenticated'
  if (secured && isAnonymous && current !== '/login') {
    return redirect(res, '/login')
  }
  if (!isAnonymous && redirectIfAuth) {
    const path = getRedirectPath(user.type)
    if (current !== path) {
      return redirect(res, path)
    }
  }
  return {auth}
}

export const getProfile = async () => {
  const response = await axios.get('/api/profile')
  return response.data
}

export const processLogin = async ({email, password}) => {
  const response = await axios.post('/api/login', {email, password})
  const {data} = response
  if (typeof window !== 'undefined') {
    window[WINDOW_USER_SCRIPT_VARIABLE] = data || {}
  }
}

export const processLogout = async () => {
  if (typeof window !== 'undefined') {
    window[WINDOW_USER_SCRIPT_VARIABLE] = {}
  }
  await axios.post('/api/logout')
  Router.push('/login')
}
