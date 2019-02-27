export default function Layout ({ children }) {
  return (
    <div>
      {children}
      <style jsx>{`
        :global(body) {font-family: Roboto, sans-serif; padding: 30px; color: #444;}
        div :global(h1) {margin-bottom: 5px;}
        div :global(p) {font-size: 18px; line-height: 30px; margin-top: 30px;}
        div :global(.caption) {color: #ccc; margin-top: 0; font-size: 14px; text-align: center;}
      `}</style>
    </div>
  )
}
