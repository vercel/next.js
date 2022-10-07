'client'

export default function Client() {
  globalThis._script_order = globalThis._script_order || []

  if (
    globalThis._script_order[globalThis._script_order.length - 1] !== 'render'
  ) {
    globalThis._script_order.push('render')
  }

  console.log(globalThis._script_order)

  return null
}
