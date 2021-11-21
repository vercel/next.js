import _JSXStyle from "styled-jsx/style";
const color = "red";
const otherColor = "green";
const A = ()=><div className={"jsx-f44d626e14f3cfbc"}>

    <p className={"jsx-f44d626e14f3cfbc"}>test</p>

    <_JSXStyle id={"f44d626e14f3cfbc"}>{`p.jsx-f44d626e14f3cfbc {color:${color}}`}</_JSXStyle>

  </div>
;
const B = ()=><div className={"jsx-9db1df72abe82640"}>

    <p className={"jsx-9db1df72abe82640"}>test</p>

    <_JSXStyle id={"9db1df72abe82640"}>{`p.jsx-9db1df72abe82640 {color:${otherColor}}`}</_JSXStyle>

  </div>
;
export default (()=><div >

    <A />

    <B />

  </div>
);
