import { nanoid } from 'nanoid'

export default function Layout({ children }) {
  return (
    <>
      <h1 id="render-id">{nanoid()}</h1>
      <div>{children}</div>
    </>
  )
}
