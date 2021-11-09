import _JSXStyle from "styled-jsx/style";
import colors1, { size } from "./constants";
const color = "red";
const bar = new String("div.jsx-aaed0341accea8f {font-size:3em}");
bar.__hash = "aaed0341accea8f";
const baz = new String("div {font-size:3em}");
baz.__hash = "aaed0341accea8f";
const a = new String(`div {font-size:${size}em}`);
a.__hash = "f14cced97c082d2c";
export const uh = bar;
export const foo = new String(`div.jsx-a0d126276b085021 {color:${color}}`);
foo.__hash = "a0d126276b085021";
({
    styles: <_JSXStyle id={"47e08c293b53f262"}>{`div.jsx-47e08c293b53f262 {color:${colors1.green.light}}
a.jsx-47e08c293b53f262 {color:red}`}</_JSXStyle>,
    className: "jsx-47e08c293b53f262"
});
const b = {
    styles: <_JSXStyle id={"47e08c293b53f262"}>{`div.jsx-47e08c293b53f262 {color:${colors1.green.light}}
a.jsx-47e08c293b53f262 {color:red}`}</_JSXStyle>,
    className: "jsx-47e08c293b53f262"
};
const dynamic = (colors)=>{
    const b = {
        styles: <_JSXStyle id={"79d79305fa1611e"} dynamic={[
            colors.green.light
        ]}>{`div.__jsx-style-dynamic-selector {color:${colors.green.light}}
a.__jsx-style-dynamic-selector {color:red}`}</_JSXStyle>,
        className: _JSXStyle.dynamic([
            [
                "79d79305fa1611e",
                [
                    colors.green.light
                ]
            ]
        ])
    };
};
export default {
    styles: <_JSXStyle id={"d9cea503e39c5315"}>{`div.jsx-d9cea503e39c5315 {font-size:3em}
p.jsx-d9cea503e39c5315 {color:${color}}`}</_JSXStyle>,
    className: "jsx-d9cea503e39c5315"
};
