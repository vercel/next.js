import _JSXStyle from "next/dist/shared/lib/styled-jsx";
const darken = (c)=>c
;
const color = 'red';
const otherColor = 'green';
const mediumScreen = '680px';
const animationDuration = '200ms';
const animationName = 'my-cool-animation';
const obj = {
    display: 'block'
};
export default (({ display  })=><div className={"jsx-ee922fe7eac00c5e " + _JSXStyle.dynamic([
        [
            "374046f7d83960f0",
            [
                display ? 'block' : 'none'
            ]
        ],
        [
            "f297f0e8b24d55b4",
            [
                darken(color) + 2
            ]
        ],
        [
            "f03bb8922a3e69b1",
            [
                darken(color)
            ]
        ]
    ])}>

    <p className={"jsx-ee922fe7eac00c5e " + _JSXStyle.dynamic([
        [
            "374046f7d83960f0",
            [
                display ? 'block' : 'none'
            ]
        ],
        [
            "f297f0e8b24d55b4",
            [
                darken(color) + 2
            ]
        ],
        [
            "f03bb8922a3e69b1",
            [
                darken(color)
            ]
        ]
    ])}>test</p>

    <_JSXStyle id={"a8107430c6c528d0"}>{`p.${color}.jsx-ee922fe7eac00c5e{color:${otherColor};display:${obj.display}}`}</_JSXStyle>

    <_JSXStyle id={"94239b6d6b42c9b5"}>{"p.jsx-ee922fe7eac00c5e{color:red}"}</_JSXStyle>

    <_JSXStyle id={"f0a3b803e45f3568"}>{`body{background:${color}}`}</_JSXStyle>

    <_JSXStyle id={"f0a3b803e45f3568"}>{`body{background:${color}}`}</_JSXStyle>

    // TODO: the next two should have the same hash

    <_JSXStyle id={"accb2339a5faf0f2"}>{`p.jsx-ee922fe7eac00c5e{color:${color}}`}</_JSXStyle>

    <_JSXStyle id={"accb2339a5faf0f2"}>{`p.jsx-ee922fe7eac00c5e{color:${color}}`}</_JSXStyle>

    <_JSXStyle id={"f03bb8922a3e69b1"} dynamic={[
        darken(color)
    ]}>{`p.__jsx-style-dynamic-selector{color:${darken(color)}}`}</_JSXStyle>

    <_JSXStyle id={"f297f0e8b24d55b4"} dynamic={[
        darken(color) + 2
    ]}>{`p.__jsx-style-dynamic-selector{color:${darken(color) + 2}}`}</_JSXStyle>

    <_JSXStyle id={"d7df5b0be4ac2e3b"}>{`@media(min-width:${mediumScreen}){p.jsx-ee922fe7eac00c5e{color:green}p.jsx-ee922fe7eac00c5e{color:${`red`}}}p.jsx-ee922fe7eac00c5e{color:red}`}</_JSXStyle>

    <_JSXStyle id={"ff76c479bb5bf1a9"}>{`p.jsx-ee922fe7eac00c5e{-webkit-animation-duration:${animationDuration};-moz-animation-duration:${animationDuration};-o-animation-duration:${animationDuration};animation-duration:${animationDuration}}`}</_JSXStyle>

    <_JSXStyle id={"f4ba3ad133457656"}>{`p.jsx-ee922fe7eac00c5e{-webkit-animation:${animationDuration} forwards ${animationName};-moz-animation:${animationDuration} forwards ${animationName};-o-animation:${animationDuration} forwards ${animationName};animation:${animationDuration} forwards ${animationName}}div.jsx-ee922fe7eac00c5e{background:${color}}`}</_JSXStyle>



    <_JSXStyle id={"374046f7d83960f0"} dynamic={[
        display ? 'block' : 'none'
    ]}>{`span.__jsx-style-dynamic-selector{display:${display ? 'block' : 'none'}}`}</_JSXStyle>

    // TODO: causes bad syntax

    {}

  </div>
);
