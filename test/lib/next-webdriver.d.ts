interface Chain {
  elementByCss: (selector: string) => Chain
  elementById: () => Chain
  getValue: () => Chain
  text: () => Chain
  type: () => Chain
  moveTo: () => Chain
  getComputedCss: () => Chain
  getAttribute: () => Chain
  hasElementByCssSelector: () => Chain
  click: () => Chain
  elementsByCss: () => Chain
  waitForElementByCss: () => Chain
  eval: () => Chain
  log: () => Chain
  url: () => Chain
  back: () => Chain
  forward: () => Chain
  refresh: () => Chain
  setDimensions: (opts: { height: number; width: number }) => Chain
  close: () => Chain
  quit: () => Chain
}

export default function (
  appPort: number,
  path: string,
  waitHydration?: boolean,
  allowHydrationRetry?: boolean
): Promise<Chain>
