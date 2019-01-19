import { Component } from 'react'

function * generatorMethod () {
  yield 1
}

async function fooBar () {
  for (let val of generatorMethod()) {
    return val
  }
}

export default class Index extends Component {
  async otherMethod () {
    await fooBar()
  }
  render () {
    const foo = new Map([['cats', 'dogs']])
    return <h1>Garbage {foo.get('cats')}</h1>
  }
}
