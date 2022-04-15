import _JSXStyle from "styled-jsx/style";
export default class {
    render() {
        return <div className={_JSXStyle.dynamic([
            [
                "e1b0d3df4c8dcbf0",
                [
                    inputSize ? 'height: calc(2 * var(--a)) !important;' : ''
                ]
            ]
        ])}>

          <p className={_JSXStyle.dynamic([
            [
                "e1b0d3df4c8dcbf0",
                [
                    inputSize ? 'height: calc(2 * var(--a)) !important;' : ''
                ]
            ]
        ])}>test</p>

          <_JSXStyle id={"e1b0d3df4c8dcbf0"} dynamic={[
            inputSize ? 'height: calc(2 * var(--a)) !important;' : ''
        ]}>{`@media only screen{a.__jsx-style-dynamic-selector{${inputSize ? 'height: calc(2 * var(--a)) !important;' : ''}
                }}`}</_JSXStyle>

        </div>;
    }
};
