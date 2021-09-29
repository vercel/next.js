import _JSXStyle from "styled-jsx/style";
export default class {
    render() {
        return <div className={_JSXStyle.dynamic([
            [
                "eb1d88515aa07b6b",
                [
                    a || "var(--c)",
                    b || "inherit"
                ]
            ]
        ])}>
          <p className={_JSXStyle.dynamic([
            [
                "eb1d88515aa07b6b",
                [
                    a || "var(--c)",
                    b || "inherit"
                ]
            ]
        ])}>test</p>
          <_JSXStyle id={"eb1d88515aa07b6b"} dynamic={[
            a || "var(--c)",
            b || "inherit"
        ]}>{`.a .b.__jsx-style-dynamic-selector {display:inline-block;
padding:0 ${a || "var(--c)"};
color:${b || "inherit"}}`}</_JSXStyle>
        </div>;
    }
}