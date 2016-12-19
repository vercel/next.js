import React from 'react'

export default ({ children }) => (
  <p>
    {children}
    <style jsx>{`
      p {
        font: 13px Helvetica, Arial;
        margin: 10px 0;
      }
    `}</style>
  </p>
)
