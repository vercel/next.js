import { ReactText, HTMLAttributes } from 'react'
import { JSX as LocalJSX } from '@ionic/core'
import { JSX as IoniconsJSX } from 'ionicons'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import IonicIntrinsicElements = LocalJSX.IntrinsicElements
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import IoniconsIntrinsicElements = IoniconsJSX.IntrinsicElements

type ToReact<T> = {
  [P in keyof T]?: T[P] &
    Omit<HTMLAttributes<Element>, 'className'> & {
      class?: string
      key?: ReactText
    }
}

declare global {
  export namespace JSX {
    interface IntrinsicElements
      extends ToReact<IonicIntrinsicElements & IoniconsIntrinsicElements> {
      key?: string
    }
  }
}
