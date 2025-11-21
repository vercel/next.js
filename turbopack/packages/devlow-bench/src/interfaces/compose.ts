import { Interface } from '../index.js'

export default function compose(...ifaces: Interface[]): Interface {
  const allKeys = new Set<keyof Interface>()
  for (const iface of ifaces) {
    for (const key of Object.keys(iface)) {
      allKeys.add(key as keyof Interface)
    }
  }
  const composed: any = {}
  for (const key of allKeys) {
    if (key.startsWith('filter')) {
      composed[key] = async (items: any, ...args: any[]) => {
        for (const iface of ifaces) {
          const anyIface = iface as any
          if (anyIface[key]) {
            items = await anyIface[key](items, ...args)
          }
        }
        return items
      }
    } else {
      composed[key] = async (...args: any[]) => {
        for (const iface of ifaces) {
          const anyIface = iface as any
          if (anyIface[key]) {
            await anyIface[key](...args)
          }
        }
      }
    }
  }
  return composed
}
