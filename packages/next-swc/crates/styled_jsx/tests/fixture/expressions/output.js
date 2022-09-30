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
export default (({ display  })=><div className={"jsx-b452af554142d27 " + _JSXStyle.dynamic([
        [
            "469c0b1cc43512b8",
            [
                display ? 'block' : 'none'
            ]
        ],
        [
            "d05e300c372f73ee",
            [
                darken(color) + 2
            ]
        ],
        [
            "72e421eb2017491a",
            [
                darken(color)
            ]
        ]
    ])}>

    <p className={"jsx-b452af554142d27 " + _JSXStyle.dynamic([
        [
            "469c0b1cc43512b8",
            [
                display ? 'block' : 'none'
            ]
        ],
        [
            "d05e300c372f73ee",
            [
                darken(color) + 2
            ]
        ],
        [
            "72e421eb2017491a",
            [
                darken(color)
            ]
        ]
    ])}>test</p>

    <_JSXStyle id={"cb56eab0db38d266"}>{`p.${color}.jsx-b452af554142d27{color:${otherColor};display:${obj.display}}`}</_JSXStyle>

    <_JSXStyle id={"94239b6d6b42c9b5"}>{"p.jsx-b452af554142d27{color:red}"}</_JSXStyle>

    <_JSXStyle id={"e66306ac259712aa"}>{`body{background:${color}}`}</_JSXStyle>

    <_JSXStyle id={"e66306ac259712aa"}>{`body{background:${color}}`}</_JSXStyle>

    // TODO: the next two should have the same hash

    <_JSXStyle id={"f08108daf927b99d"}>{`p.jsx-b452af554142d27{color:${color}}`}</_JSXStyle>

    <_JSXStyle id={"f08108daf927b99d"}>{`p.jsx-b452af554142d27{color:${color}}`}</_JSXStyle>

    <_JSXStyle id={"72e421eb2017491a"} dynamic={[
        darken(color)
    ]}>{`p.__jsx-style-dynamic-selector{color:${darken(color)}}`}</_JSXStyle>

    <_JSXStyle id={"d05e300c372f73ee"} dynamic={[
        darken(color) + 2
    ]}>{`p.__jsx-style-dynamic-selector{color:${darken(color) + 2}}`}</_JSXStyle>

    <_JSXStyle id={"7c5c5bde49d6c65d"}>{`@media(min-width:${mediumScreen}){p.jsx-b452af554142d27{color:green}p.jsx-b452af554142d27{color:${`red`}}}p.jsx-b452af554142d27{color:red}`}</_JSXStyle>

    <_JSXStyle id={"c5506be0b4762e0b"}>{`p.jsx-b452af554142d27{-webkit-animation-duration:${animationDuration};-moz-animation-duration:${animationDuration};-o-animation-duration:${animationDuration};animation-duration:${animationDuration}}`}</_JSXStyle>

    <_JSXStyle id={"ed798aa885be9084"}>{`p.jsx-b452af554142d27{-webkit-animation:${animationDuration} forwards ${animationName};-moz-animation:${animationDuration} forwards ${animationName};-o-animation:${animationDuration} forwards ${animationName};animation:${animationDuration} forwards ${animationName}}div.jsx-b452af554142d27{background:${color}}`}</_JSXStyle>



    <_JSXStyle id={"469c0b1cc43512b8"} dynamic={[
        display ? 'block' : 'none'
    ]}>{`span.__jsx-style-dynamic-selector{display:${display ? 'block' : 'none'}}`}</_JSXStyle>

    // TODO: causes bad syntax

    {}

  </div>);
