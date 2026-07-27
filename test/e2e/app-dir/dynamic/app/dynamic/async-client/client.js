'use client'

let name = await Promise.resolve('async')

export default (props) => {
  return <button {...props}>this is an {name} client button with SSR</button>
}
