import React from 'react'
import ansiHTML from 'ansi-html'
import Head from 'next-server/head'
import styleSheet from '../static/error-debug.css'

// This component is rendered through dev-error-overlay on the client side.
// On the server side it's rendered directly
export default function ErrorDebug ({error, info}) {
  const { name, message } = error
  return (
    <div className='errorDebug'>
      <Head>
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
        <link rel='stylesheet' href={`/_next/${styleSheet}`} />
      </Head>
      {
        name === 'ModuleBuildError' && message
          ? <pre className='stack' dangerouslySetInnerHTML={{ __html: ansiHTML(encodeHtml(message)) }} />
          : <StackTrace error={error} info={info} />
      }
    </div>
  )
}

const StackTrace = ({ error: { name, message, stack }, info }) => (
  <div>
    <div className='heading'>{message || name}</div>
    <pre className='stack'>
      {stack}
    </pre>
    {info && <pre className='stack'>
      {info.componentStack}
    </pre>}
  </div>
)

const encodeHtml = str => {
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// see color definitions of babel-code-frame:
// https://github.com/babel/babel/blob/master/packages/babel-code-frame/src/index.js

ansiHTML.setColors({
  reset: ['6F6767', '0e0d0d'],
  darkgrey: '6F6767',
  yellow: '6F6767',
  green: 'ebe7e5',
  magenta: 'ebe7e5',
  blue: 'ebe7e5',
  cyan: 'ebe7e5',
  red: 'ff001f'
})
