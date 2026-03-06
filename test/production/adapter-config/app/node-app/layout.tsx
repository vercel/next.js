export const markdown = true

export default function Layout({ dialog, children }: any) {
  return (
    <>
      {dialog}
      {children}
    </>
  )
}
