import { Component } from './loader'

async function loadMap<
  T extends {[k: string]: {}},
  K extends keyof T
>(loader: Record<K, () => Promise<Component<T[K]>>>): Promise<Record<K, Component<T[K]>>> {
    const components: Array<Promise<[K, Component<T[K]>]>> = []

    for (const l in loader) {
      if (loader.hasOwnProperty(l)) {
        components.push(loader[l]().then((loaded) => [l, loaded] as [K, Component<T[K]>]))
      }
    }

    const map = await Promise.all(components)

    const loaded = { [map[0][0]]: map[0][1] } as Record<K, Component<T[K]>>

    map.forEach((l, k) => {
      if (k !== 0) loaded[l[0]] = l[1]
    })

    return loaded
}

export default loadMap
