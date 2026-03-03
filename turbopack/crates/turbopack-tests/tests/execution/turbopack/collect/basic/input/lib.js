import './a' with { turbopackEmit: 'my-test', turbopackEmitData: 'data-for-a' }

console.log('this is lib.js')
export default function () {
  import('./async')
}
