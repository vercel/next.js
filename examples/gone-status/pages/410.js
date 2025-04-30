// Custom 410 page for Pages Router
export default function Custom410() {
  return (
    <div className="custom-410">
      <h1>410 - Content Gone</h1>
      <p>The content you were looking for has been permanently removed.</p>
      <a href="/">Return to home page</a>

      <style jsx>{`
        .custom-410 {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          text-align: center;
        }

        h1 {
          font-size: 2.5rem;
          color: #e10000;
          margin-bottom: 1rem;
        }

        p {
          margin-bottom: 2rem;
          font-size: 1.2rem;
        }

        a {
          color: #0070f3;
          text-decoration: none;
          border: 1px solid #0070f3;
          padding: 0.75rem 1.5rem;
          border-radius: 5px;
          transition: all 0.2s ease;
        }

        a:hover {
          background-color: #0070f3;
          color: white;
        }
      `}</style>
    </div>
  );
}
