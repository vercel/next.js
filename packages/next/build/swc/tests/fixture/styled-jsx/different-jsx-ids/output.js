import _JSXStyle from "styled-jsx/style";
const color = "red";
const otherColor = "green";
const A = ()=><div className={"jsx-706d62168f5e52dc"}>
    <p className={"jsx-706d62168f5e52dc"}>test</p>
    <_JSXStyle id={"706d62168f5e52dc"}>{`p.jsx-706d62168f5e52dc {color:${color}}`}</_JSXStyle>
  </div>
;
const B = ()=><div className={"jsx-d698fce2ff7d98bb"}>
    <p className={"jsx-d698fce2ff7d98bb"}>test</p>
    <_JSXStyle id={"d698fce2ff7d98bb"}>{`p.jsx-d698fce2ff7d98bb {color:${otherColor}}`}</_JSXStyle>
  </div>
;
export default (()=><div >
    <A />
    <B />
  </div>
);