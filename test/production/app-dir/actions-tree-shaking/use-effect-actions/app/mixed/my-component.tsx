import { action3 } from './actions'

export default function MyComponent() {
  // to prevent tree-shaking
  if (globalThis.DO_NOT_TREE_SHAKE) {
    console.log('MyComponent imported action3', action3)
  }
  return <span>i'm MyComponent</span>
}
