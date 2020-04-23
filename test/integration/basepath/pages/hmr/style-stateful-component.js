import React, { Component } from 'react'

export default class StyleStateFul extends Component {
  render() {
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
}
