import Balancer from 'react-wrap-balancer'
import type { ReactNode } from 'react'

export function Caption({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs my-3 font-mono text-gray-500 text-center leading-normal">
      <Balancer>
        <span className="[&>a]:post-link">{children}</span>
      </Balancer>
    </p>
  )
}
