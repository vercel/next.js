import * as React from 'react'
import Link from 'next/link'
import MyComponent from '../components/MyComponent'
export default () =>
  <div>
    <p>Hello there</p>
    <MyComponent />
    <div>Click <Link prefetch href={{ pathname: 'pagewithasync' }}><a>Reactpage</a></Link> </div>
  </div>