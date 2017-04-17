import React from 'react'
import Header from '../components/Header'
import Counter from '../components/Counter'
import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(import('../components/hello'))

export default () => (
  <div>
    <Header />
    <DynamicComponent />
    <p>HOME PAGE is here!</p>
    <Counter />
  </div>
)
