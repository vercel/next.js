import React from 'react'
import Link from 'next/link'

const Index = () => {
  return (
    <div className="main">
      <style jsx>
        {`
          .main {
            background: hotpink;
            padding: 50px;
            border-radius: 4px;
            display: flex;
            margin: 200px;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            color: white;
          }

          a {
            color: white;
            display: block;
            text-decoration: unset;
            font-size: 20px;
            margin: 5px 0;
          }

          a:hover {
            color: #3f51b5;
          }
        `}
      </style>
      <Link href="/birds">
        <a>Birds Example</a>
      </Link>
      <Link href="/boxes">
        <a>Boxes Example</a>
      </Link>
    </div>
  )
}

export default Index
