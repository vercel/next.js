import React from 'react'
import Session from './session'

export default (Component) => class extends React.Component {
  static async getInitialProps (ctx) {
    const session = new Session({ req: ctx.req })

    let initialProps = {}
    if (Component.getInitialProps) {
      initialProps = Component.getInitialProps({ ...ctx, session })
    }

    const sessionData = await session.getSession()
    console.log(sessionData)
    let isLoggedIn = false
    if (sessionData.user && sessionData.user.id) {
      isLoggedIn = true
    }

    return {session: sessionData, isLoggedIn, ...initialProps}
  }

  render () {
    return <Component {...this.props} />
  }
}
