import css from './nest.module.css'

export default function Layout({ children }) {
  return (
    <div className={css.layout}>
      nest layout<div>{children}</div>
    </div>
  )
}
