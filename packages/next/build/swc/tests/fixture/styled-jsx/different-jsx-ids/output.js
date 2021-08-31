import _JSXStyle from "styled-jsx/style";
const color = "red";
const otherColor = "green";
const A = ()=><div className={"jsx-66316acda06416e3"}>
    <p className={"jsx-66316acda06416e3"}>test</p>
    <_JSXStyle id={"66316acda06416e3"}>{`p.jsx-66316acda06416e3 {color:${color}}`}</_JSXStyle>
  </div>
;
const B = ()=><div className={"jsx-ff0d0e46b2f4197e"}>
    <p className={"jsx-ff0d0e46b2f4197e"}>test</p>
    <_JSXStyle id={"ff0d0e46b2f4197e"}>{`p.jsx-ff0d0e46b2f4197e {color:${otherColor}}`}</_JSXStyle>
  </div>
;
export default (()=><div >
    <A />
    <B />
  </div>
);