import _JSXStyle from "next/dist/shared/lib/styled-jsx";
export default function Home({ fontFamily  }) {
    return <div className={_JSXStyle.dynamic([
        [
            "ae6b96ca586fe51a",
            [
                fontFamily
            ]
        ]
    ])}>

      <_JSXStyle id={"ae6b96ca586fe51a"} dynamic={[
        fontFamily
    ]}>{`body{font-family:${fontFamily}}code:before,code:after{content:"\`"}`}</_JSXStyle>

    </div>;
};
