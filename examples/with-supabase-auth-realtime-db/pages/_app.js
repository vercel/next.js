import '~/styles/style.scss'
import React from 'react'
import App from 'next/app'
import Router from 'next/router'
import UserContext from 'lib/UserContext'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
)

export default class SupabaseSlackClone extends App {
  state = {
    authLoaded: false,
    user: null,
  }

  componentDidMount = () => {
    const user = localStorage.getItem('supabase-slack-clone')
    if (user) this.setState({ user, authLoaded: true })
    else Router.push('/')
  }

  signIn = async (id, username) => {
    try {
      let { body } = await supabase
        .from('users')
        .match({ username })
        .select('id, username')
      const existing = body[0]
      const { body: user } = existing?.id
        ? await supabase
            .from('users')
            .update({ id, username })
            .match({ id })
            .single()
        : await supabase.from('users').insert([{ id, username }]).single()

      localStorage.setItem('supabase-slack-clone', user.id)
      this.setState({ user: user.id }, () => {
        Router.push('/channels/[id]', '/channels/1')
      })
    } catch (error) {
      console.log('error', error)
    }
  }

  signOut = () => {
    supabase.auth.logout()
    localStorage.removeItem('supabase-slack-clone')
    this.setState({ user: null })
    Router.push('/')
  }

  render() {
    const { Component, pageProps } = this.props
    return (
      <UserContext.Provider
        value={{
          authLoaded: this.state.authLoaded,
          user: this.state.user,
          signIn: this.signIn,
          signOut: this.signOut,
        }}
      >
        <Component {...pageProps} />
      </UserContext.Provider>
    )
  }
}
