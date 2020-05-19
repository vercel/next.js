import cookieSession from './cookieSession'
import cookieSessionRefresh from './cookieSessionRefresh'

export default function commonMiddleware(handler) {
  return cookieSession(cookieSessionRefresh(handler))
}
