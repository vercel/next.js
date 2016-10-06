
import test from 'ava'
import React from 'react'
import { render } from '../server/render'

test('Rendered component', async t => {
  console.log(await render('./fixtures/base-stateless-component', null, null, { test: true }))
})
