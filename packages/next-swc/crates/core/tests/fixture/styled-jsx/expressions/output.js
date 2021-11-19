import _JSXStyle from "styled-jsx/style";
const darken = (c)=>c
;
const color = "red";
const otherColor = "green";
const mediumScreen = "680px";
const animationDuration = "200ms";
const animationName = "my-cool-animation";
const obj = {
    display: "block"
};
export default (({ display  })=><div className={"jsx-843124768056a74c " + _JSXStyle.dynamic([
        [
            "a124d516c2c0707d",
            [
                display ? "block" : "none"
            ]
        ],
        [
            "108a316873f1c6fc",
            [
                darken(color) + 2
            ]
        ],
        [
            "785cf5e120672da8",
            [
                darken(color)
            ]
        ]
    ])}>

    <p className={"jsx-843124768056a74c " + _JSXStyle.dynamic([
        [
            "a124d516c2c0707d",
            [
                display ? "block" : "none"
            ]
        ],
        [
            "108a316873f1c6fc",
            [
                darken(color) + 2
            ]
        ],
        [
            "785cf5e120672da8",
            [
                darken(color)
            ]
        ]
    ])}>test</p>

    <_JSXStyle id={"5df43f2861c900e6"}>{`p.${color}.jsx-843124768056a74c {color:${otherColor};
display:${obj.display}}`}</_JSXStyle>

    <_JSXStyle id={"94239b6d6b42c9b5"}>{"p.jsx-843124768056a74c {color:red}"}</_JSXStyle>

    <_JSXStyle id={"a971cf00393d41be"}>{`body {background:${color}}`}</_JSXStyle>

    <_JSXStyle id={"a971cf00393d41be"}>{`body {background:${color}}`}</_JSXStyle>

    // TODO: the next two should have the same hash

    <_JSXStyle id={"5cadd6714ea141b4"}>{`p.jsx-843124768056a74c {color:${color}}`}</_JSXStyle>

    <_JSXStyle id={"5cadd6714ea141b4"}>{`p.jsx-843124768056a74c {color:${color}}`}</_JSXStyle>

    <_JSXStyle id={"785cf5e120672da8"} dynamic={[
        darken(color)
    ]}>{`p.__jsx-style-dynamic-selector {color:${darken(color)}}`}</_JSXStyle>

    <_JSXStyle id={"108a316873f1c6fc"} dynamic={[
        darken(color) + 2
    ]}>{`p.__jsx-style-dynamic-selector {color:${darken(color) + 2}}`}</_JSXStyle>

    <_JSXStyle id={"bb5a8a5ee5cd36db"}>{`@media (min-width:${mediumScreen}) {p.jsx-843124768056a74c {color:green}
p.jsx-843124768056a74c {color:${`red`}}}
p.jsx-843124768056a74c {color:red}`}</_JSXStyle>

    <_JSXStyle id={"99746edba785c617"}>{`p.jsx-843124768056a74c {-webkit-animation-duration:${animationDuration};
animation-duration:${animationDuration}}`}</_JSXStyle>

    <_JSXStyle id={"62d69d091a270e9d"}>{`p.jsx-843124768056a74c {-webkit-animation:${animationDuration} forwards ${animationName};
animation:${animationDuration} forwards ${animationName}}
div.jsx-843124768056a74c {background:${color}}`}</_JSXStyle>



    <_JSXStyle id={"a124d516c2c0707d"} dynamic={[
        display ? "block" : "none"
    ]}>{`span.__jsx-style-dynamic-selector {display:${display ? "block" : "none"}}`}</_JSXStyle>

    // TODO: causes bad syntax

    {}

  </div>
);
