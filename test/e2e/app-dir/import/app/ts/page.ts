import React from 'react'
import CompJs from '../../components/compJs'
import CompJsx from '../../components/compJsx'
import CompTs from '../../components/compTs'
import CompTsx from '../../components/compTsx'

export default function Page() {
  return React.createElement(React.Fragment, null, [
    React.createElement(CompJs, null),
    React.createElement(CompJsx, null),
    React.createElement(CompTs, null),
    React.createElement(CompTsx, null),
  ])
}
