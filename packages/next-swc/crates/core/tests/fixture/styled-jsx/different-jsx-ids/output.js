import _JSXStyle from "styled-jsx/style";
const color = 'red';
const otherColor = 'green';
const A = ()=><div className={"jsx-498d4e86e548e679"}>

    <p className={"jsx-498d4e86e548e679"}>test</p>

    <_JSXStyle id={"498d4e86e548e679"}>{`p.jsx-498d4e86e548e679{color:${color}}`}</_JSXStyle>

  </div>
;
const B = ()=><div className={"jsx-d051a1c8140076ed"}>

    <p className={"jsx-d051a1c8140076ed"}>test</p>

    <_JSXStyle id={"d051a1c8140076ed"}>{`p.jsx-d051a1c8140076ed{color:${otherColor}}`}</_JSXStyle>

  </div>
;
export default (()=><div >

    <A />

    <B />

  </div>
);
