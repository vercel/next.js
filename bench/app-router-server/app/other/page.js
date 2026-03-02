import './lib'

import list from '@turbopack/collect' with { turbopackCollect: 'my-test' }
console.log(list)
Promise.all(list.map((item) => item.import())).then(console.log)

export default function page() {
  return <div>hello</div>
}
