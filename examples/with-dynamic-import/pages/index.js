import React from 'react'
import Header from '../components/Header'
import Counter from '../components/Counter'
import withImport from '../lib/with-import'

const DynamicComponent = withImport(import('../components/hello'))

export default () => (
  <div>
    <Header />
    <DynamicComponent />
    <p>HOME PAGE is here!</p>
    <Counter />
  </div>
)
