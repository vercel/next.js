import React from 'react'
import { AppRouterContext } from '../shared/lib/app-router-context'

export default function Link(props) {
  const appRouter = React.useContext(AppRouterContext)
  const [isPending, startTransition] = React.useTransition()

  const onClick = (event) => {
    event.preventDefault()
    startTransition(() => appRouter.push(props.href))
  }
  return (
    <a href={props.href} onClick={onClick}>
      {props.children} {isPending && 'PENDING'}
    </a>
  )
}
