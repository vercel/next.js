import React from 'react'

export default function Post({ title, children }) {
  return (
    <div className="main">
      <h1 className="post-heading">{title}</h1>
      {children}
      <style>{`
        .main {
          font: 15px Helvetica, Arial;
          border: 1px solid #eee;
          padding: 0 10px;
        }
        h1 {
          font-size: 16px;
          font-weight: bold;
          margin: 10px 0;
        }
      `}</style>
    </div>
  )
}
