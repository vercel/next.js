import css from './ly.module.css'

export default async function Layout({ children }) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return (
    <div className={css.layout}>
      ly layout<div>{children}</div>
    </div>
  )
}
