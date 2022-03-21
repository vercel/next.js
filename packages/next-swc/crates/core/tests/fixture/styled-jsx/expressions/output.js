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
export default (({ display  })=><div className={"jsx-1ada4ad4dab7822f " + _JSXStyle.dynamic([
        [
            "183a75aa3877c18a",
            [
                display ? "block" : "none"
            ]
        ],
        [
            "f07deae908c9294f",
            [
                darken(color) + 2
            ]
        ],
        [
            "50021e09364b96c8",
            [
                darken(color)
            ]
        ]
    ])}>

    <p className={"jsx-1ada4ad4dab7822f " + _JSXStyle.dynamic([
        [
            "183a75aa3877c18a",
            [
                display ? "block" : "none"
            ]
        ],
        [
            "f07deae908c9294f",
            [
                darken(color) + 2
            ]
        ],
        [
            "50021e09364b96c8",
            [
                darken(color)
            ]
        ]
    ])}>test</p>

    <_JSXStyle id={"6116059e04f3bff7"}>{`p.${color}.jsx-1ada4ad4dab7822f{color:${otherColor};display:${obj.display}}`}</_JSXStyle>

    <_JSXStyle id={"94239b6d6b42c9b5"}>{"p.jsx-1ada4ad4dab7822f{color:red}"}</_JSXStyle>

    <_JSXStyle id={"171303fb0d7f788b"}>{`body{background:${color}}`}</_JSXStyle>

    <_JSXStyle id={"171303fb0d7f788b"}>{`body{background:${color}}`}</_JSXStyle>

    // TODO: the next two should have the same hash

    <_JSXStyle id={"332b21af86b0ec6"}>{`p.jsx-1ada4ad4dab7822f{color:${color}}`}</_JSXStyle>

    <_JSXStyle id={"332b21af86b0ec6"}>{`p.jsx-1ada4ad4dab7822f{color:${color}}`}</_JSXStyle>

    <_JSXStyle id={"50021e09364b96c8"} dynamic={[
        darken(color)
    ]}>{`p.__jsx-style-dynamic-selector{color:${darken(color)}}`}</_JSXStyle>

    <_JSXStyle id={"f07deae908c9294f"} dynamic={[
        darken(color) + 2
    ]}>{`p.__jsx-style-dynamic-selector{color:${darken(color) + 2}}`}</_JSXStyle>

    <_JSXStyle id={"4e4be2da62837c76"}>{`@media(min-width:${mediumScreen}){p.jsx-1ada4ad4dab7822f{color:green}p.jsx-1ada4ad4dab7822f{color:${`red`}}}p.jsx-1ada4ad4dab7822f{color:red}`}</_JSXStyle>

    <_JSXStyle id={"27040f0829fb73d4"}>{`p.jsx-1ada4ad4dab7822f{-webkit-animation-duration:${animationDuration};-moz-animation-duration:${animationDuration};-o-animation-duration:${animationDuration};animation-duration:${animationDuration}}`}</_JSXStyle>

    <_JSXStyle id={"3e72d735e703a530"}>{`p.jsx-1ada4ad4dab7822f{-webkit-animation:${animationDuration} forwards ${animationName};-moz-animation:${animationDuration} forwards ${animationName};-o-animation:${animationDuration} forwards ${animationName};animation:${animationDuration} forwards ${animationName}}div.jsx-1ada4ad4dab7822f{background:${color}}`}</_JSXStyle>



    <_JSXStyle id={"183a75aa3877c18a"} dynamic={[
        display ? "block" : "none"
    ]}>{`span.__jsx-style-dynamic-selector{display:${display ? "block" : "none"}}`}</_JSXStyle>

    // TODO: causes bad syntax

    {}

  </div>
);
