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
export default (({ display  })=><div className={"jsx-802e359ee0ab20c4 " + _JSXStyle.dynamic([
        [
            "76aa3eae4e21e4ca",
            [
                display ? "block" : "none"
            ]
        ],
        [
            "5ba905f763f40220",
            [
                darken(color) + 2
            ]
        ],
        [
            "c4bb394aae9bd00b",
            [
                darken(color)
            ]
        ]
    ])}>
    <p className={"jsx-802e359ee0ab20c4 " + _JSXStyle.dynamic([
        [
            "76aa3eae4e21e4ca",
            [
                display ? "block" : "none"
            ]
        ],
        [
            "5ba905f763f40220",
            [
                darken(color) + 2
            ]
        ],
        [
            "c4bb394aae9bd00b",
            [
                darken(color)
            ]
        ]
    ])}>test</p>
    <_JSXStyle id={"f3d3af42197b4734"}>{`p.${color}.jsx-802e359ee0ab20c4 {color:${otherColor};
display:${obj.display}}`}</_JSXStyle>
    <_JSXStyle id={"94239b6d6b42c9b5"}>{"p.jsx-802e359ee0ab20c4 {color:red}"}</_JSXStyle>
    <_JSXStyle id={"32d670fe91cc2fa1"}>{`body {background:${color}}`}</_JSXStyle>
    <_JSXStyle id={"3134af19d5bf663e"}>{`body {background:${color}}`}</_JSXStyle>
    // TODO: the next two should have the same hash
    <_JSXStyle id={"8e512e75f8a7c096"}>{`p.jsx-802e359ee0ab20c4 {color:${color}}`}</_JSXStyle>
    <_JSXStyle id={"c25992945d0883cd"}>{`p.jsx-802e359ee0ab20c4 {color:${color}}`}</_JSXStyle>
    <_JSXStyle id={"2f77c12736da5e9e"} dynamic={[
        darken(color)
    ]}>{`p.__jsx-style-dynamic-selector {color:${darken(color)}}`}</_JSXStyle>
    <_JSXStyle id={"10454d61c818c6eb"} dynamic={[
        darken(color) + 2
    ]}>{`p.__jsx-style-dynamic-selector {color:${darken(color) + 2}}`}</_JSXStyle>
    <_JSXStyle id={"281f7ed4d9150bac"}>{`@media (min-width:${mediumScreen}) {p.jsx-802e359ee0ab20c4 {color:green}
p.jsx-802e359ee0ab20c4 {color:${`red`}}}
p.jsx-802e359ee0ab20c4 {color:red}`}</_JSXStyle>
    <_JSXStyle id={"d8950943ae4cf3dc"}>{`p.jsx-802e359ee0ab20c4 {-webkit-animation-duration:${animationDuration};
animation-duration:${animationDuration}}`}</_JSXStyle>
    <_JSXStyle id={"1ee00865f92bdbe7"}>{`p.jsx-802e359ee0ab20c4 {-webkit-animation:${animationDuration} forwards ${animationName};
animation:${animationDuration} forwards ${animationName}}
div.jsx-802e359ee0ab20c4 {background:${color}}`}</_JSXStyle>

    <_JSXStyle id={"4925b8e0a7ab752a"} dynamic={[
        display ? "block" : "none"
    ]}>{`span.__jsx-style-dynamic-selector {display:${display ? "block" : "none"}}`}</_JSXStyle>
    // TODO: causes bad syntax
    {}
  </div>
);