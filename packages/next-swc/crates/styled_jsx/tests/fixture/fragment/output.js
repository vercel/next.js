import _JSXStyle from "next/dist/shared/lib/styled-jsx";
import React from 'react';
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

    <_JSXStyle id={"6dd5f97e085c0297"}>{"p.jsx-6dd5f97e085c0297{color:cyan}.foo.jsx-6dd5f97e085c0297{font-size:18px;color:hotpink}#head.jsx-6dd5f97e085c0297{text-decoration:underline}"}</_JSXStyle>

  </>
);
function Component1() {
    return <>

      <div >test</div>

    </>;
}
function Component2() {
    return <div className={"jsx-678f41ca6d3b294b"}>

      <_JSXStyle id={"678f41ca6d3b294b"}>{"div.jsx-678f41ca6d3b294b{color:red}"}</_JSXStyle>

    </div>;
}
