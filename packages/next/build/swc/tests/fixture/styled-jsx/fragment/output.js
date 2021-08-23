import _JSXStyle from "styled-jsx/style";
import React from "react";
export default (()=><>
    <p className={"jsx-6dd5f97e085c0297"}>Testing!!!</p>
    <p className={"jsx-6dd5f97e085c0297" + " " + "foo"}>Bar</p>
    <>
      <h3 id="head" className={"jsx-6dd5f97e085c0297"}>Title...</h3>
      <React.Fragment >
        <p className={"jsx-6dd5f97e085c0297"}>hello</p>
        <>
          <p className={"jsx-6dd5f97e085c0297"}>foo</p>
          <p className={"jsx-6dd5f97e085c0297"}>bar</p>
        </>
        <p className={"jsx-6dd5f97e085c0297"}>world</p>
      </React.Fragment>
    </>
    <_JSXStyle id={"6dd5f97e085c0297"}>{`
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
    `}</_JSXStyle>
  </>
);
function Component1() {
    return <>
      <div >test</div>
    </>;
}
function Component2() {
    return <div className={"jsx-678f41ca6d3b294b"}>
      <_JSXStyle id={"678f41ca6d3b294b"}>{`
        div {
          color: red;
        }
      `}</_JSXStyle>
    </div>;
}