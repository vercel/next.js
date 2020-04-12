import React, { useEffect } from 'react'
import Router from 'next/router'

export const SecondStrategy = () => {
  const GOOGLE_BUTTON_ID = 'google-sign-in-button-2'

  useEffect(() => {
    try {
      window.gapi.load('auth2', async () => {
        window.gapi.signin2.render(GOOGLE_BUTTON_ID, {
          theme: 'light',
          onsuccess: onSuccess,
        })
      })
    } catch (e) {
      console.error(e)
    }
  })

  const onSuccess = async () => {
    Router.push('/second-strategy')
  }

  return <div id={GOOGLE_BUTTON_ID} style={{ marginBottom: '20px' }} />
}
