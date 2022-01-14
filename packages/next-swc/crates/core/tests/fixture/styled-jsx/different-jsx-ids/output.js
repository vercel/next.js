import _JSXStyle from "styled-jsx/style";
const color = "red";
const otherColor = "green";
const A = ()=><div className={"jsx-319ecfcffea32bfb"}>

    <p className={"jsx-319ecfcffea32bfb"}>test</p>

    <_JSXStyle id={"319ecfcffea32bfb"}>{`p.jsx-319ecfcffea32bfb{color:${color}}`}</_JSXStyle>

  </div>
;
const B = ()=><div className={"jsx-8a19b9bd65b986e0"}>

    <p className={"jsx-8a19b9bd65b986e0"}>test</p>

    <_JSXStyle id={"8a19b9bd65b986e0"}>{`p.jsx-8a19b9bd65b986e0{color:${otherColor}}`}</_JSXStyle>

  </div>
;
export default (()=><div >

    <A />

    <B />

  </div>
);
