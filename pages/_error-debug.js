import React from 'react'
import Head from 'next/head'
import ansiHTML from 'ansi-html'

export default class ErrorDebug extends React.Component {
  static getInitialProps ({ err }) {
    const { name, message, stack, module } = err
    return { name, message, stack, path: module ? module.rawRequest : null }
  }

  render () {
    const { name, message, stack, path } = this.props

    return <div className='errorDebug'>
      <Head>
        <meta name='viewport' content='width=device-width, initial-scale=1.0' />
      </Head>
      {path ? <div className='heading'>Error in {path}</div> : null}
      {
        name === 'ModuleBuildError'
        ? <pre className='message' dangerouslySetInnerHTML={{ __html: ansiHTML(encodeHtml(message)) }} />
        : <pre className='message'>{stack}</pre>
      }
      <style jsx global>{`
        body {
          background: #a6004c;
          margin: 0;
        }
      `}</style>
      <style jsx>{`
        .errorDebug {
          height: 100%;
          padding: 16px;
          box-sizing: border-box;
        }

        .message {
          font-family: "SF Mono", "Roboto Mono", "Fira Mono", menlo-regular, monospace;
          font-size: 10px;
          color: #fbe7f1;
          margin: 0;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        .heading {
          font-family: -apple-system, BlinkMacSystemFont, Roboto, "Segoe UI", "Fira Sans", Avenir, "Helvetica Neue", "Lucida Grande", sans-serif;
          font-size: 13px;
          font-weight: bold;
          color: #ff84bf;
          margin-bottom: 20pxl
        }
      `}</style>
    </div>
  }
}

const encodeHtml = str => {
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// see color definitions of babel-code-frame:
// https://github.com/babel/babel/blob/master/packages/babel-code-frame/src/index.js

ansiHTML.setColors({
  reset: ['fff', 'a6004c'],
  darkgrey: 'e54590',
  yellow: 'ee8cbb',
  green: 'f2a2c7',
  magenta: 'fbe7f1',
  blue: 'fff',
  cyan: 'ef8bb9',
  red: 'fff'
})
