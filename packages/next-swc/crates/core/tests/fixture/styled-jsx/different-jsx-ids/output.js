import _JSXStyle from "styled-jsx/style";
const color = 'red';
const otherColor = 'green';
const A = ()=><div className={"jsx-c7fc0b05a693e9a4"}>

    <p className={"jsx-c7fc0b05a693e9a4"}>test</p>

    <_JSXStyle id={"c7fc0b05a693e9a4"}>{`p.jsx-c7fc0b05a693e9a4{color:${color}}`}</_JSXStyle>

  </div>
;
const B = ()=><div className={"jsx-1046a40dadd9ba3a"}>

    <p className={"jsx-1046a40dadd9ba3a"}>test</p>

    <_JSXStyle id={"1046a40dadd9ba3a"}>{`p.jsx-1046a40dadd9ba3a{color:${otherColor}}`}</_JSXStyle>

  </div>
;
export default (()=><div >

    <A />

    <B />

  </div>
);
