import _JSXStyle from "styled-jsx/style";
const color = 'red';
const otherColor = 'green';
const A = ()=><div className={"jsx-551210e97e875d0e"}>

    <p className={"jsx-551210e97e875d0e"}>test</p>

    <_JSXStyle id={"551210e97e875d0e"}>{`p.jsx-551210e97e875d0e{color:${color}}`}</_JSXStyle>

  </div>;
const B = ()=><div className={"jsx-d1ed441bb35f699d"}>

    <p className={"jsx-d1ed441bb35f699d"}>test</p>

    <_JSXStyle id={"d1ed441bb35f699d"}>{`p.jsx-d1ed441bb35f699d{color:${otherColor}}`}</_JSXStyle>

  </div>;
export default (()=><div >

    <A />

    <B />

  </div>);
