export default function Footer({ color }) {
  return (
    <footer>
      <style jsx>{`
        footer {
          color: ${color};
          padding: 1rem;
        }
      `}</style>
      <span>Footer</span>
    </footer>
  )
}
