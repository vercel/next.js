import _JSXStyle from "styled-jsx/style";
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
export default (({ display  })=><div className={"jsx-2a76485ca2068ace " + _JSXStyle.dynamic([
        [
            "4de68c6ba6380d96",
            [
                display ? 'block' : 'none'
            ]
        ],
        [
            "6d0e1b3ba7bfc0af",
            [
                darken(color) + 2
            ]
        ],
        [
            "df64ca12d2e4b695",
            [
                darken(color)
            ]
        ]
    ])}>

    <p className={"jsx-2a76485ca2068ace " + _JSXStyle.dynamic([
        [
            "4de68c6ba6380d96",
            [
                display ? 'block' : 'none'
            ]
        ],
        [
            "6d0e1b3ba7bfc0af",
            [
                darken(color) + 2
            ]
        ],
        [
            "df64ca12d2e4b695",
            [
                darken(color)
            ]
        ]
    ])}>test</p>

    <_JSXStyle id={"8e76843694b6211e"}>{`p.${color}.jsx-2a76485ca2068ace{color:${otherColor};display:${obj.display}}`}</_JSXStyle>

    <_JSXStyle id={"94239b6d6b42c9b5"}>{"p.jsx-2a76485ca2068ace{color:red}"}</_JSXStyle>

    <_JSXStyle id={"10dc1d9b22b2a7b5"}>{`body{background:${color}}`}</_JSXStyle>

    <_JSXStyle id={"10dc1d9b22b2a7b5"}>{`body{background:${color}}`}</_JSXStyle>

    // TODO: the next two should have the same hash

    <_JSXStyle id={"e8741288e177981"}>{`p.jsx-2a76485ca2068ace{color:${color}}`}</_JSXStyle>

    <_JSXStyle id={"e8741288e177981"}>{`p.jsx-2a76485ca2068ace{color:${color}}`}</_JSXStyle>

    <_JSXStyle id={"df64ca12d2e4b695"} dynamic={[
        darken(color)
    ]}>{`p.__jsx-style-dynamic-selector{color:${darken(color)}}`}</_JSXStyle>

    <_JSXStyle id={"6d0e1b3ba7bfc0af"} dynamic={[
        darken(color) + 2
    ]}>{`p.__jsx-style-dynamic-selector{color:${darken(color) + 2}}`}</_JSXStyle>

    <_JSXStyle id={"487ddbb5adef30ad"}>{`@media(min-width:${mediumScreen}){p.jsx-2a76485ca2068ace{color:green}p.jsx-2a76485ca2068ace{color:${`red`}}}p.jsx-2a76485ca2068ace{color:red}`}</_JSXStyle>

    <_JSXStyle id={"443cba17cf59f486"}>{`p.jsx-2a76485ca2068ace{-webkit-animation-duration:${animationDuration};-moz-animation-duration:${animationDuration};-o-animation-duration:${animationDuration};animation-duration:${animationDuration}}`}</_JSXStyle>

    <_JSXStyle id={"7bb457ebb3d9dcfc"}>{`p.jsx-2a76485ca2068ace{-webkit-animation:${animationDuration} forwards ${animationName};-moz-animation:${animationDuration} forwards ${animationName};-o-animation:${animationDuration} forwards ${animationName};animation:${animationDuration} forwards ${animationName}}div.jsx-2a76485ca2068ace{background:${color}}`}</_JSXStyle>



    <_JSXStyle id={"4de68c6ba6380d96"} dynamic={[
        display ? 'block' : 'none'
    ]}>{`span.__jsx-style-dynamic-selector{display:${display ? 'block' : 'none'}}`}</_JSXStyle>

    // TODO: causes bad syntax

    {}

  </div>
);
