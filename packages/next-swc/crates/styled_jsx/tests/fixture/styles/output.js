import _JSXStyle from "styled-jsx/style";
import colors, { size } from './constants';
const color = 'red';
const bar = new String("div.jsx-aaed0341accea8f{font-size:3em}");
bar.__hash = "aaed0341accea8f";
const baz = new String("div{font-size:3em}");
baz.__hash = "aaed0341accea8f";
const a = new String(`div{font-size:${size}em}`);
a.__hash = "b4e02b3e84cc50c";
export const uh = bar;
export const foo = new String(`div.jsx-1a001e3709d54ba4{color:${color}}`);
foo.__hash = "1a001e3709d54ba4";
({
    styles: <_JSXStyle id={"38ae14c4ec5e0907"}>{`div.jsx-38ae14c4ec5e0907{color:${colors.green.light}}a.jsx-38ae14c4ec5e0907{color:red}`}</_JSXStyle>,
    className: "jsx-38ae14c4ec5e0907"
});
const b = {
    styles: <_JSXStyle id={"38ae14c4ec5e0907"}>{`div.jsx-38ae14c4ec5e0907{color:${colors.green.light}}a.jsx-38ae14c4ec5e0907{color:red}`}</_JSXStyle>,
    className: "jsx-38ae14c4ec5e0907"
};
const dynamic = (colors)=>{
    const b = {
        styles: <_JSXStyle id={"b68d3b38146e2a7d"} dynamic={[
            colors.green.light
        ]}>{`div.__jsx-style-dynamic-selector{color:${colors.green.light}}a.__jsx-style-dynamic-selector{color:red}`}</_JSXStyle>,
        className: _JSXStyle.dynamic([
            [
                "b68d3b38146e2a7d",
                [
                    colors.green.light
                ]
            ]
        ])
    };
};
export default {
    styles: <_JSXStyle id={"e14aa5a1efa47449"}>{`div.jsx-e14aa5a1efa47449{font-size:3em}p.jsx-e14aa5a1efa47449{color:${color}}`}</_JSXStyle>,
    className: "jsx-e14aa5a1efa47449"
};
