import React from 'react'
import ansiHTML from 'ansi-html'
import Head from './head'

export default ({ err: { name, message, stack, module } }) => (
  <div className='error-debug'>
    <Head>
      <meta name='viewport' content='width=device-width, initial-scale=1.0' />
    </Head>
    {module ? <div className='heading'>Error in {module.rawRequest}</div> : null}
    {
      name === 'ModuleBuildError'
      ? <pre className='message' dangerouslySetInnerHTML={{ __html: ansiHTML(encodeHtml(message)) }} />
      : <pre classname='message'>{stack}</pre>
    }
    <style jsx>{`
      .error-debug {
        background: #a6004c;
        box-sizing: border-box;
        color: #ffffff;
        overflow: auto;
        padding: 16px;
        position: fixed;
        left: 0;
        right: 0;
        top: 0;
        bottom: 0;
        z-index: 9999;
      }

      .heading {
        font-family: -apple-system, BlinkMacSystemFont, Roboto, "Segoe UI", "Fira Sans", Avenir, "Helvetica Neue", "Lucida Grande", sans-serif;
        font-size: 13px;
        font-weight: bold;
        color: #ff84bf;
        margin-bottom: 20px;
      }

      .message {
        font-family: "SF Mono", "Roboto Mono", "Fira Mono", menlo-regular, monospace;
        font-size: 10px;
        color: #fbe7f1;
        margin: 0;
        white-space: pre-wrap;
        word-wrap: break-word;
      }
    `}</style>
  </div>
)

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
