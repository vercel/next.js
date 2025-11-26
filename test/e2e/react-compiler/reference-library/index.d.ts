declare module 'reference-library' {
  import type * as React from 'react'

  export function Container(props: {
    children?: React.ReactNode
  }): React.ReactNode
}

declare module 'reference-library/client' {
  import type * as React from 'react'

  export function Container(props: {
    children?: React.ReactNode
  }): React.ReactNode
}

declare module 'reference-library/missing-react-server' {
  import type * as React from 'react'

  export function Container(props: {
    children?: React.ReactNode
  }): React.ReactNode
}
