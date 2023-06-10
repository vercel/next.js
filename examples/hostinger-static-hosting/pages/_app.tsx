import { AppProps } from 'next/app'
import Link from 'next/link'
import { useState } from 'react'

export default function App({ Component, pageProps }: AppProps) {
  const links = [
    ['/home', 'Home Page'],
    ['/about', 'About Page'],
    ['/nested-page/hello', 'Nested Route'],
  ]
  const [name, setName] = useState('')
  return (
    <div>
      <nav>
        <ul>
          {links.map((link) => (
            <li key={link[0]}>
              <Link href={link[0]}>{link[1]}</Link>
            </li>
          ))}
          <li>
            <b>Dynamic Route:</b>{' '}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="type your name"
            />
            <br />
            {name && (
              <Link href={`/dynamic-routes/${name}`}>
                Go to your dynamic url
              </Link>
            )}
          </li>
        </ul>
      </nav>
      <Component {...pageProps} />
    </div>
  )
}
