import React from 'react'

export default () => (
  <>
    <p>Testing!!!</p>
    <p className="foo">Bar</p>
    <>
      <h3 id="head">Title...</h3>
      <React.Fragment>
        <p>hello</p>
        <>
          <p>foo</p>
          <p>bar</p>
        </>
        <p>world</p>
      </React.Fragment>
    </>
    <style jsx>{`
      p {
        color: cyan;
      }
      .foo {
        font-size: 18px;
        color: hotpink;
      }
      #head {
        text-decoration: underline;
      }
    `}</style>
  </>
)

function Component1() {
  return (
    <>
      <div>test</div>
    </>
  )
}

function Component2() {
  return (
    <div>
      <style jsx>{`
        div {
          color: red;
        }
      `}</style>
    </div>
  )
}
