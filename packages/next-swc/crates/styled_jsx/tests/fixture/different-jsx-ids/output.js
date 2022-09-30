import _JSXStyle from "styled-jsx/style";
const color = 'red';
const otherColor = 'green';
const A = ()=><div className={"jsx-8522d6f4b7f930d2"}>

    <p className={"jsx-8522d6f4b7f930d2"}>test</p>

    <_JSXStyle id={"8522d6f4b7f930d2"}>{`p.jsx-8522d6f4b7f930d2{color:${color}}`}</_JSXStyle>

  </div>;
const B = ()=><div className={"jsx-d1ed441bb35f699d"}>

    <p className={"jsx-d1ed441bb35f699d"}>test</p>

    <_JSXStyle id={"d1ed441bb35f699d"}>{`p.jsx-d1ed441bb35f699d{color:${otherColor}}`}</_JSXStyle>

  </div>;
export default (()=><div >

    <A />

    <B />

  </div>);
