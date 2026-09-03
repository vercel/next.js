import { markGeneratorStarted } from '../state'

export function generateMetadata() {
  markGeneratorStarted('slot')
  return { title: 'eager slot title' }
}

export function generateViewport() {
  markGeneratorStarted('slot-viewport')
  return { width: 'device-width' }
}

export default function Page() {
  return <div id="eager-slot">eager slot</div>
}
