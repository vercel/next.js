import React from 'react'

const ErrorMessage: React.FC<{ message: string }> = ({ message }) => {
  return (
    <aside>
      {message}
      <style jsx>{`
        aside {
          padding: 1.5em;
          font-size: 14px;
          color: white;
          background-color: red;
        }
      `}</style>
    </aside>
  )
}

export default ErrorMessage
