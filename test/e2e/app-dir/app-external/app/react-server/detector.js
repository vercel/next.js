import React from 'react'

export default function Detector() {
  return 'useState' in React ? 'full' : 'subset'
}
