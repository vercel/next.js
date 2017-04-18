import React from 'react'
import Header from '../components/Header'
import Counter from '../components/Counter'
import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(import('../components/hello1'))
const DynamicComponentWithCustomLoading = dynamic(
  import('../components/hello2'),
  {
    loading: () => (<p>...</p>)
  }
)

export default () => (
  <div>
    <Header />
    <DynamicComponent />
    <DynamicComponentWithCustomLoading />
    <p>HOME PAGE is here!</p>
    <Counter />
  </div>
)
