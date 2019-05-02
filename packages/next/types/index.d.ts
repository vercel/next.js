import React from 'react'
import { IContext } from 'next-server/dist/lib/utils'

// Extend the React types with missing properties
declare module 'react' {
  // <html amp=""> support
  interface HtmlHTMLAttributes<T> extends React.HTMLAttributes<T> {
    amp?: string
  }

  // <link nonce=""> support
  interface LinkHTMLAttributes<T> extends HTMLAttributes<T> {
    nonce?: string
  }

  // <style jsx> and <style jsx global> support for styled-jsx
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    jsx?: boolean
    global?: boolean
  }
}

/**
 * Context of `page` component
 */
export type NextPageContext = IContext

/**
 * `Page` component, used for rendering `pages`.
 */
export type NextPage<P = {}> = {
  (props: P): JSX.Element
  /**
   * Used for initial page load data population. Data returned from `getInitialProps` is serialized when server rendered.
   * Make sure to return plain `Object` without using `Date`, `Map`, `Set`.
   * @param ctx Context of `page`
   */
  getInitialProps?(ctx: NextPageContext): Promise<P>
}

export { IContext }
