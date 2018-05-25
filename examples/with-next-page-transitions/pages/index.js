import React from 'react'
import Link from 'next/link'

const Index = () => (
  <div className='container bg-primary page'>
    <h1>Hello, world!</h1>
    <Link href='/about'>
      <a className='btn btn-light'>About us</a>
    </Link>
  </div>
)

export default Index
