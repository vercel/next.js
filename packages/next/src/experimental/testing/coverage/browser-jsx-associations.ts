type Point = { line: number; column: number }

export const browserJsxChildKey = (node: {
  type: string
  loc: { start: Point }
}) => `${node.type}:${node.loc.start.line}:${node.loc.start.column}`
