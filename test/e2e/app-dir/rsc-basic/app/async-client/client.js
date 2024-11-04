'use client'

import { useState } from 'react'

let name = await Promise.resolve('async')

export default (props) => {
  return `client ${useState(name)[0]}`
}
