import _JSXStyle from "styled-jsx/style";
const darken = (c)=>c;
const color = 'red';
const otherColor = 'green';
const mediumScreen = '680px';
const animationDuration = '200ms';
const animationName = 'my-cool-animation';
const obj = {
    display: 'block'
};
export default (({ display  })=><div className={"jsx-9f11e5fc71d05085 " + _JSXStyle.dynamic([
        [
            "e4db21be651d572a",
            [
                display ? 'block' : 'none'
            ]
        ],
        [
            "1f060869c7312fe5",
            [
                darken(color) + 2
            ]
        ],
        [
            "e0c373c6551675e4",
            [
                darken(color)
            ]
        ]
    ])}>

    <p className={"jsx-9f11e5fc71d05085 " + _JSXStyle.dynamic([
        [
            "e4db21be651d572a",
            [
                display ? 'block' : 'none'
            ]
        ],
        [
            "1f060869c7312fe5",
            [
                darken(color) + 2
            ]
        ],
        [
            "e0c373c6551675e4",
            [
                darken(color)
            ]
        ]
    ])}>test</p>

    <_JSXStyle id={"13bce568d963e978"}>{`p.${color}.jsx-9f11e5fc71d05085{color:${otherColor};display:${obj.display}}`}</_JSXStyle>

    <_JSXStyle id={"94239b6d6b42c9b5"}>{"p.jsx-9f11e5fc71d05085{color:red}"}</_JSXStyle>

    <_JSXStyle id={"ecd8dfc6d11e2c5e"}>{`body{background:${color}}`}</_JSXStyle>

    <_JSXStyle id={"ecd8dfc6d11e2c5e"}>{`body{background:${color}}`}</_JSXStyle>

    // TODO: the next two should have the same hash

    <_JSXStyle id={"e7486f61219e66af"}>{`p.jsx-9f11e5fc71d05085{color:${color}}`}</_JSXStyle>

    <_JSXStyle id={"e7486f61219e66af"}>{`p.jsx-9f11e5fc71d05085{color:${color}}`}</_JSXStyle>

    <_JSXStyle id={"e0c373c6551675e4"} dynamic={[
        darken(color)
    ]}>{`p.__jsx-style-dynamic-selector{color:${darken(color)}}`}</_JSXStyle>

    <_JSXStyle id={"1f060869c7312fe5"} dynamic={[
        darken(color) + 2
    ]}>{`p.__jsx-style-dynamic-selector{color:${darken(color) + 2}}`}</_JSXStyle>

    <_JSXStyle id={"7c5c5bde49d6c65d"}>{`@media(min-width:${mediumScreen}){p.jsx-9f11e5fc71d05085{color:green}p.jsx-9f11e5fc71d05085{color:${`red`}}}p.jsx-9f11e5fc71d05085{color:red}`}</_JSXStyle>

    <_JSXStyle id={"c5506be0b4762e0b"}>{`p.jsx-9f11e5fc71d05085{-webkit-animation-duration:${animationDuration};-moz-animation-duration:${animationDuration};-o-animation-duration:${animationDuration};animation-duration:${animationDuration}}`}</_JSXStyle>

    <_JSXStyle id={"82f0f2f07692d2e2"}>{`p.jsx-9f11e5fc71d05085{-webkit-animation:${animationDuration} forwards ${animationName};-moz-animation:${animationDuration} forwards ${animationName};-o-animation:${animationDuration} forwards ${animationName};animation:${animationDuration} forwards ${animationName}}div.jsx-9f11e5fc71d05085{background:${color}}`}</_JSXStyle>



    <_JSXStyle id={"e4db21be651d572a"} dynamic={[
        display ? 'block' : 'none'
    ]}>{`span.__jsx-style-dynamic-selector{display:${display ? 'block' : 'none'}}`}</_JSXStyle>

    // TODO: causes bad syntax

    {}

  </div>);
