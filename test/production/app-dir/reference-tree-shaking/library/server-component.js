import { unusedServerComponent } from './unused-server-component.js'

export function UsedServerComponent() {
  return 'This is Server Component'
}

export function UnusedServerComponent() {
  return unusedServerComponent()
}
