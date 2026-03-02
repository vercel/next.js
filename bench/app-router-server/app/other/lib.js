import './a' with { turbopackEmit: 'my-test', turbopackEmitData: 'data-for-a' }
import './b' with { turbopackEmit: 'my-test', turbopackEmitData: 'data-for-b' }

console.log('this is lib.js')
