import * as React from 'react'
import { SomeGlobalFromCore } from 'package-two'

const getBgColor = () => ({ backgroundColor: '#fff' })

export default () => (
  <SomeGlobalFromCore styles={{ color: 'hotpink', ...getBgColor() }} />
)
