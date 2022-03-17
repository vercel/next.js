export default function getRuntime() {
  return process.version ? `Node.js ${process.version}` : 'Edge/Browser'
}
