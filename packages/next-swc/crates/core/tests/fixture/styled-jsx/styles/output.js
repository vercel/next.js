import _JSXStyle from "styled-jsx/style";
import colors, { size } from "./constants";
const color = "red";
const bar = new String("div.jsx-aaed0341accea8f{font-size:3em}");
bar.__hash = "aaed0341accea8f";
const baz = new String("div{font-size:3em}");
baz.__hash = "aaed0341accea8f";
const a = new String(`div{font-size:${size}em}`);
a.__hash = "5ba1fcb8b8f3d807";
export const uh = bar;
export const foo = new String(`div.jsx-945eaa83250ed332{color:${color}}`);
foo.__hash = "945eaa83250ed332";
({
    styles: <_JSXStyle id={"c107a919a5b2943d"}>{`div.jsx-c107a919a5b2943d{color:${colors.green.light}}a.jsx-c107a919a5b2943d{color:red}`}</_JSXStyle>,
    className: "jsx-c107a919a5b2943d"
});
const b = {
    styles: <_JSXStyle id={"c107a919a5b2943d"}>{`div.jsx-c107a919a5b2943d{color:${colors.green.light}}a.jsx-c107a919a5b2943d{color:red}`}</_JSXStyle>,
    className: "jsx-c107a919a5b2943d"
};
const dynamic = (colors1)=>{
    const b = {
        styles: <_JSXStyle id={"60132422fc87f1d1"} dynamic={[
            colors1.green.light
        ]}>{`div.__jsx-style-dynamic-selector{color:${colors1.green.light}}a.__jsx-style-dynamic-selector{color:red}`}</_JSXStyle>,
        className: _JSXStyle.dynamic([
            [
                "60132422fc87f1d1",
                [
                    colors1.green.light
                ]
            ]
        ])
    };
};
export default {
    styles: <_JSXStyle id={"e5da8dd7ff5c7f39"}>{`div.jsx-e5da8dd7ff5c7f39{font-size:3em}p.jsx-e5da8dd7ff5c7f39{color:${color}}`}</_JSXStyle>,
    className: "jsx-e5da8dd7ff5c7f39"
};
