import RenderValues from '../../../render-values'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RenderValues prefix="before-param" />
      {children}
    </>
  )
}
