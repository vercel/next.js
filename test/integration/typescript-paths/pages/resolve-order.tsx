import React, { type JSX } from 'react'
import api from '@lib/api'
export default function ResolveOrder(): JSX.Element {
  return <div>{api()}</div>
}
