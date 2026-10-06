import { markGeneratorStarted } from './state'

export function generateMetadata() {
  markGeneratorStarted('children')
  return { title: 'eager children title' }
}

export function generateViewport() {
  markGeneratorStarted('children-viewport')
  return { width: 'device-width' }
}

export default function Page() {
  return <div id="eager-children">eager children</div>
}
