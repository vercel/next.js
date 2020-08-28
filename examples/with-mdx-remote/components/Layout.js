export default function Layout({ children }) {
  return (
    <>
      <div className="wrapper">{children}</div>
      <style jsx>{`
        .wrapper {
          max-width: 36rem;
          margin: 0 auto;
        }
      `}</style>
      <style jsx global>{`
        :root {
          --site-color: royalblue;
          --divider-color: rgba(0, 0, 0, 0.4);
        }

        html {
          font: 100%/1.5 system-ui;
        }

        a {
          color: inherit;
          text-decoration-color: var(--divider-color);
          text-decoration-thickness: 2px;
        }

        a:hover {
          color: var(--site-color);
          text-decoration-color: currentcolor;
        }
      `}</style>
    </>
  )
}
