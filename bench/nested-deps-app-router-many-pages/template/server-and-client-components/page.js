import React from 'react'
import Comp from '../../../components/index.jsx'
import ClientComponent from './client-component'

export default function Home() {
  return (
    <>
      <h1>Hello!</h1>
      <Comp />
      <ClientComponent />
    </>
  )
}
