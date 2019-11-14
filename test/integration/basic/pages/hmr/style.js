import React from 'react'
export default () => {
  return (
    <React.Fragment>
      <div className="hmr-style-page">
        <p>
          This is the style page.
          <style jsx>{`
            p {
              font-size: 100px;
            }
          `}</style>
        </p>
      </div>
    </React.Fragment>
  )
}
