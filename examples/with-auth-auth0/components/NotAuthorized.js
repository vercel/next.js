import React from 'react'
import Link from 'next/link'

export default () => (
  <div>
    <h1>You can't see this!</h1>
    <p>
      You're not authenticated yet. Maybe you want to <Link href='/auth/sign-in'><a>sign in</a></Link> and see what happens?
    </p>
    <style jsx>{`
      h1 {
        font-size: 50px;
        font-weight: 200;
        line-height: 40px;
        color: #e74c3c;
      }

      p {
        font-size: 30px;
        font-weight: 200;
        line-height: 40px;
        color: #e74c3c;
      }

      a {
        color: #e74c3c;
        padding-bottom: 2px;
        border-bottom: 1px solid #c0392b;
        text-decoration: none;
        font-weight: 400;
        line-height: 30px;
        transition: border-bottom .2s;
      }

      a:hover {
        border-bottom-color: #e74c3c;
      }
    `}</style>
  </div>
)
