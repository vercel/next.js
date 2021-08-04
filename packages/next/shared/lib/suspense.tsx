import * as React from "react";
import { ClientFallbackError, SuspenseContext } from "./suspense-context";

function ClientRendered(): JSX.Element {
  throw ClientFallbackError
}

export function Client({ children, fallback }: {
    children: React.ReactElement
    fallback: React.ReactElement
}) {
  const mode = React.useContext(SuspenseContext)
  const content = mode === 'STATIC'
    ? <ClientRendered />
    : children
  return <React.Suspense fallback={fallback}>{content}</React.Suspense>
}