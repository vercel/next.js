import cookieSession from './cookieSession'
import cookieSessionRefresh from './cookieSessionRefresh'

export default handler => cookieSession(cookieSessionRefresh(handler))
