import React from 'react'
import Link from 'next/link'

const Header: React.FC = () => {
  return (
    <nav>
      <div className="left">
        <Link href="/" legacyBehavior>
          <a>Blog</a>
        </Link>
        <Link href="/drafts" legacyBehavior>
          <a>Drafts</a>
        </Link>
      </div>
      <div className="right">
        <Link href="/create" legacyBehavior>
          <a>+ New draft</a>
        </Link>
      </div>
      <style jsx>{`
        nav {
          display: flex;
          padding: 2rem;
          align-items: center;
        }

        .bold {
          font-weight: bold;
        }

        a {
          text-decoration: none;
          color: #000;
          display: inline-block;
        }

        a + a {
          margin-left: 1rem;
        }

        .right {
          margin-left: auto;
        }

        .right a {
          border: 2px solid black;
          padding: 0.5rem 1rem;
          border-radius: 3px;
        }
      `}</style>
    </nav>
  )
}

export default Header
