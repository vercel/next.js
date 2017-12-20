import React from 'react'

import styles from './style.scss'

export default (props) => {
  return <div>
    <style jsx>{styles}</style>
    <h1>Example with external scoped scss</h1>
    <p>
      Thanks to <a href='https://github.com/coox'>Eric Redon </a>
      for <a href='https://github.com/coox/styled-jsx-css-loader'>
      styled-jsx-css-loader </a>
      and <a href='https://github.com/connor-baer'>Connor Bär</a> for
      his guides to configure scss in
      <a href='https://github.com/coox/styled-jsx-css-loader/issues/6'> this </a>
      issue.
    </p>
  </div>
}
