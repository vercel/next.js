'use client'

export default function Client() {
  if (typeof window !== 'undefined') {
    window._script_order = window._script_order || []

    if (window._script_order[window._script_order.length - 1] !== 'render') {
      window._script_order.push('render')
    }

    console.log(window._script_order)
  }

  return null
}
