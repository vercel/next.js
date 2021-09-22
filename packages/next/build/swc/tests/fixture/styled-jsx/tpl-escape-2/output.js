import _JSXStyle from "styled-jsx/style";
export default function Home({ fontFamily  }) {
    return <div className={_JSXStyle.dynamic([
        [
            "2566fdd7bc25c35",
            [
                fontFamily
            ]
        ]
    ])}>
      <_JSXStyle id={"2566fdd7bc25c35"} dynamic={[
        fontFamily
    ]}>{`body {font-family:${fontFamily}}
code:before, code:after {content:'\`'}`}</_JSXStyle>
    </div>;
}