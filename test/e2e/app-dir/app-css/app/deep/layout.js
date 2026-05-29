import css from './deep.module.css'

export default function Layout({ children }) {
  return (
    <div className={css.layout}>
      deep layout<div>{children}</div>
    </div>
  )
}
