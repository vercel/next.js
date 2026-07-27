import { ViewTransition } from 'react'
import { Toggle } from './Toggle'

export default function BasicPage() {
  return (
    <ViewTransition name="page">
      <Toggle />
    </ViewTransition>
  )
}
