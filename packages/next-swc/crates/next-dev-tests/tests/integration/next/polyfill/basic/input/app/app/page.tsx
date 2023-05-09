import Component from './client'

export default function Page() {
  return (
    <div id="server">
      {Buffer.from('Hello Server Component', 'utf-8').toString()}
      <Component />
    </div>
  )
}
