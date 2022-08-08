type LayoutProps = {
  children?: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      {children}
      <style jsx global>{`
        body {
          font-family: Roboto, sans-serif;
          padding: 30px;
          color: #444;
        }
      `}</style>
    </>
  )
}
