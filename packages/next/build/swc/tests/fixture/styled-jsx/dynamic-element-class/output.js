import _JSXStyle from "styled-jsx/style";
export default class {
    render() {
        const Element1 = "div";
        return <Element1 className={"jsx-f825b24bbab5b83b" + " " + "root"}>
        <p className={"jsx-f825b24bbab5b83b"}>dynamic element</p>
        <_JSXStyle id={"f825b24bbab5b83b"}>{`
          .root {
            background: red;
          }
        `}</_JSXStyle>
      </Element1>;
    }
}
const Element2 = "div";
export const Test2 = class {
    render() {
        return <Element2 className="root">
        <p className={"jsx-f825b24bbab5b83b"}>dynamic element</p>
        <_JSXStyle id={"f825b24bbab5b83b"}>{`
          .root {
            background: red;
          }
        `}</_JSXStyle>
      </Element2>;
    }
}