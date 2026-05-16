import * as React from 'react'
import { format } from 'date-fns'

export default function Home() {
  return <div>{format(new Date(), "'Today is a' eeee")}</div>
}
