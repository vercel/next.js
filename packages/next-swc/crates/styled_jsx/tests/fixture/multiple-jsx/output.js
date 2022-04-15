import _JSXStyle from "styled-jsx/style";
const attrs = {
    id: 'test'
};
const Test1 = ()=><div className={"jsx-a9535d7d5f32c3c4"}>

    <span {...attrs} data-test="test" className={"jsx-a9535d7d5f32c3c4" + " " + (attrs && attrs.className != null && attrs.className || "")}>test</span>

    <Component />

    <_JSXStyle id={"a9535d7d5f32c3c4"}>{"span.jsx-a9535d7d5f32c3c4{color:red}"}</_JSXStyle>

  </div>
;
const Test2 = ()=><span >test</span>
;
const Test3 = ()=><div className={"jsx-a9535d7d5f32c3c4"}>

    <span className={"jsx-a9535d7d5f32c3c4"}>test</span>

    <_JSXStyle id={"a9535d7d5f32c3c4"}>{"span.jsx-a9535d7d5f32c3c4{color:red}"}</_JSXStyle>

  </div>
;
export default class {
    render() {
        return <div className={"jsx-b2b86d63f35d25ee"}>

        <p className={"jsx-b2b86d63f35d25ee"}>test</p>

        <_JSXStyle id={"b2b86d63f35d25ee"}>{"p.jsx-b2b86d63f35d25ee{color:red}"}</_JSXStyle>

      </div>;
    }
};
