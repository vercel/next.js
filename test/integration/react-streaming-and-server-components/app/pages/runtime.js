export default function () {
  return process.env.__NEXT_RUNTIME === 'nodejs'
    ? `Runtime: Node.js ${process.version}`
    : 'Runtime: Edge/Browser'
}

export const config = {
  runtime: 'nodejs',
}
