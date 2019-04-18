import React from 'react'
/**
 * Types for AMP in React are not available, here we add only the types required for the core
 */
declare module 'react' {
  interface HtmlHTMLAttributes<T> extends React.HTMLAttributes<T> {
    amp?: string;
  }

  // nonce in <link /> is allowed
  interface LinkHTMLAttributes<T> extends HTMLAttributes<T> {
    nonce?: string
  }
}
