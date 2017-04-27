import React from 'react'
import Header from '../components/Header'
import Counter from '../components/Counter'
import dynamic from 'next/dynamic'
import { asyncReactor } from 'async-reactor'

const DynamicComponent = dynamic(import('../components/hello1'))
const DynamicComponentWithCustomLoading = dynamic(
  import('../components/hello2'),
  {
    loading: () => (<p>...</p>)
  }
)
const DynamicComponentWithNoSSR = dynamic(
  import('../components/hello3'),
  { ssr: false }
)
const DynamicComponentWithAsyncReactor = asyncReactor(async () => {
  const Hello4 = await import('../components/hello4')
  return (<Hello4 />)
})

export default () => (
  <div>
    <Header />
    <DynamicComponent />
    <DynamicComponentWithCustomLoading />
    <DynamicComponentWithNoSSR />
    <DynamicComponentWithAsyncReactor />
    <p>HOME PAGE is here!</p>
    <Counter />
  </div>
)
