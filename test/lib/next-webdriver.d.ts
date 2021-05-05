interface ChainMethods {
  elementByCss: (selector: string) => Chain<Element>
  elementById: () => Chain<Element>
  getValue: () => Chain<any>
  text: () => Chain<string>
  type: () => Chain<any>
  moveTo: () => Chain<any>
  getComputedCss: () => Chain<any>
  getAttribute: () => Chain<any>
  hasElementByCssSelector: () => Chain<any>
  click: () => Chain<any>
  elementsByCss: () => Chain<Element[]>
  waitForElementByCss: (arg: string) => Chain<any>
  eval: () => Chain<any>
  log: () => Chain<any>
  url: () => Chain<any>
  back: () => Chain<any>
  forward: () => Chain<any>
  refresh: () => Chain<any>
  setDimensions: (opts: { height: number; width: number }) => Chain<any>
  close: () => Chain<any>
  quit: () => Chain<any>
}

interface Chain<T> extends Promise<T & ChainMethods>, ChainMethods {}

type Browser = { __brand: 'Browser' }

export default function (
  appPort: number,
  path: string,
  waitHydration?: boolean,
  allowHydrationRetry?: boolean
): Promise<Chain<Browser>>
