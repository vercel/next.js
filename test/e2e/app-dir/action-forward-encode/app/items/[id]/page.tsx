import ItemCaller from './item-caller'

export function generateStaticParams() {
  return [{ id: '1' }]
}

export default function Page() {
  return <ItemCaller />
}
