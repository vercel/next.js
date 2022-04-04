export default function () {
  return process.version
    ? `Runtime: Node.js ${process.version}`
    : 'Runtime: Edge/Browser'
}

export const config = {
  runtime: 'nodejs',
}
