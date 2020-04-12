import React from 'react'
import Head from 'next/head'
import Router from 'next/router'
import { signOut, fetcher } from '../lib/utils'
import useSWR from 'swr'

const Index = () => {
  const { data, error } = useSWR('/api/drive', fetcher)
  if (error) {
    Router.push('/')
  }

  return (
    <div>
      <Head>
        <title>Third Strategy | Google Sign-In</title>
      </Head>
      <div style={{ padding: '50px' }}>
        <h3>Google Drive files:</h3>
        <ul>{data && data.map(file => <li key={file.id}>{file.name}</li>)}</ul>
        <button onClick={signOut}>Sign Out</button>
      </div>
    </div>
  )
}

export default Index
