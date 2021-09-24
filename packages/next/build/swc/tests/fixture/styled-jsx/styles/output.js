import _JSXStyle from "styled-jsx/style";
import colors, { size } from "./constants";
const color = "red";
const bar = new String("div.jsx-aaed0341accea8f {font-size:3em}");
bar.__hash = "aaed0341accea8f";
const baz = new String("div {font-size:3em}");
baz.__hash = "aaed0341accea8f";
const a = new String(`div {font-size:${size}em}`);
a.__hash = "611c3773b76f8ea3";
export const uh = bar;
export const foo = new String(`div.jsx-e46da79e05d23fff {color:${color}}`);
foo.__hash = "e46da79e05d23fff";
({
    styles: <_JSXStyle id={"12e2c41a8d37fe78"} dynamic={[
        colors.green.light
    ]}>{`div.__jsx-style-dynamic-selector {color:${colors.green.light}}
a.__jsx-style-dynamic-selector {color:red}`}</_JSXStyle>,
    className: _JSXStyle.dynamic([
        [
            "12e2c41a8d37fe78",
            [
                colors.green.light
            ]
        ]
    ])
});
const b = {
    styles: <_JSXStyle id={"d5617758481f82cd"} dynamic={[
        colors.green.light
    ]}>{`div.__jsx-style-dynamic-selector {color:${colors.green.light}}
a.__jsx-style-dynamic-selector {color:red}`}</_JSXStyle>,
    className: _JSXStyle.dynamic([
        [
            "d5617758481f82cd",
            [
                colors.green.light
            ]
        ]
    ])
};
const dynamic = (colors)=>{
    const b = {
        styles: <_JSXStyle id={"a7ac579c753e9d90"} dynamic={[
            colors.green.light
        ]}>{`div.__jsx-style-dynamic-selector {color:${colors.green.light}}
a.__jsx-style-dynamic-selector {color:red}`}</_JSXStyle>,
        className: _JSXStyle.dynamic([
            [
                "a7ac579c753e9d90",
                [
                    colors.green.light
                ]
            ]
        ])
    };
};
export default {
    styles: <_JSXStyle id={"e4642e4164827181"}>{`div.jsx-e4642e4164827181 {font-size:3em}
p.jsx-e4642e4164827181 {color:${color}}`}</_JSXStyle>,
    className: "jsx-e4642e4164827181"
};