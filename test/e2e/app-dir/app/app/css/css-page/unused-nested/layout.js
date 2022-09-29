import { layout } from './styles'

export default function ServerLayout({ children }) {
  return (
    <>
      <p className={layout.mod}>Layout</p>
      {children}
    </>
  )
}
