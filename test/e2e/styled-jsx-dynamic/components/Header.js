export default function Header({ bg, fg }) {
  return (
    <header>
      <style jsx>{`
        header {
          background-color: ${bg};
          color: ${fg};
          padding: 1rem;
        }
      `}</style>
      <span>Header</span>
    </header>
  )
}
