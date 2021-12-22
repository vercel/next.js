// Definitions by: @types/styled-jsx <https://www.npmjs.com/package/@types/styled-jsx>

declare function css(chunks: TemplateStringsArray, ...args: any[]): JSX.Element
declare namespace css {
  function global(chunks: TemplateStringsArray, ...args: any[]): JSX.Element
  function resolve(
    chunks: TemplateStringsArray,
    ...args: any[]
  ): { className: string; styles: JSX.Element }
}
export = css
