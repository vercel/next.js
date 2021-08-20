import _JSXStyle from "styled-jsx/style";
const attrs = {
  id: "test"
};
const Test1 = ()=><div className={"jsx-b3e1b6a7c9b96113"}>
    <span {...attrs} data-test="test" className={"jsx-b3e1b6a7c9b96113" + " " + (attrs && attrs.className != null && attrs.className || "")}>test</span>
    <Component />
    <_JSXStyle id={"b3e1b6a7c9b96113"}>{`
      span {
        color: red;
      }
    `}</_JSXStyle>
  </div>
;
const Test2 = ()=><span >test</span>
;
const Test3 = ()=><div className={"jsx-b3e1b6a7c9b96113"}>
    <span className={"jsx-b3e1b6a7c9b96113"}>test</span>
    <_JSXStyle id={"b3e1b6a7c9b96113"}>{`
      span {
        color: red;
      }
    `}</_JSXStyle>
  </div>
;
export default class {
  render() {
      return <div className={"jsx-b3e1b6a7c9b96113"}>
        <p className={"jsx-b3e1b6a7c9b96113"}>test</p>
        <_JSXStyle id={"b3e1b6a7c9b96113"}>{`
          p {
            color: red;
          }
        `}</_JSXStyle>
      </div>;
  }
}