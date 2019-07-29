import * as React from 'react'

export default class Index extends React.PureComponent {
  render() {
    return (
      <>
        <h2>Hello World</h2>
        <div>{`Build ID: ${process.env.NEXT_BUILD_ID}`}</div>
      </>
    )
  }
}
