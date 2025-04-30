// Custom Gone Error Page for App Router
export default function RootGone() {
  return (
    <div className="gone-container">
      <h1>410 - Content Gone</h1>
      <p>The content you're looking for has been permanently removed.</p>
      <a href="/">Return to home page</a>

      <style jsx>{`
        .gone-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          text-align: center;
          padding: 0 1rem;
        }

        h1 {
          margin: 0;
          font-size: 2rem;
          color: #e10000;
        }

        p {
          margin: 1rem 0;
        }

        a {
          color: #0070f3;
          text-decoration: none;
          margin-top: 1rem;
        }

        a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
