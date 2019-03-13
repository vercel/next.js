export default function Layout ({ children }) {
  return (
    <>
      {children}
      <style jsx global>{`
        body {font-family: Roboto, sans-serif; padding: 30px; color: #444;}
      `}</style>
    </>
  )
}
