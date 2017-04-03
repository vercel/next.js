import Link from 'next/link'
import MyComponent from '../components/MyComponent'
export default () =>
  <div>
    <p>Hello there</p>
    <MyComponent />
    <Link prefetch href='/pagewithasync'><a>Reactpage</a></Link>
  </div>