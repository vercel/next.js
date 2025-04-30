// App Router - Home Page
export default function Home() {
  return (
    <div className="container">
      <main>
        <h1>Next.js 410 Gone Status Example</h1>

        <div className="grid">
          <div className="card">
            <h2>App Router Examples</h2>
            <ul>
              <li>
                <a href="/app-posts/active">Active post</a> - 200 OK
              </li>
              <li>
                <a href="/app-posts/deleted">Deleted post</a> - 410 Gone
              </li>
              <li>
                <a href="/app-posts/nonexistent">Nonexistent post</a> - 404 Not
                Found
              </li>
            </ul>
          </div>

          <div className="card">
            <h2>Pages Router Examples</h2>
            <ul>
              <li>
                <a href="/posts/active">Active post</a> - 200 OK
              </li>
              <li>
                <a href="/posts/deleted">Deleted post</a> - 410 Gone
              </li>
              <li>
                <a href="/posts/nonexistent">Nonexistent post</a> - 404 Not
                Found
              </li>
            </ul>
          </div>

          <div className="card">
            <h2>API Examples</h2>
            <ul>
              <li>
                <a href="/api/posts/active">Active post API</a> - 200 OK
              </li>
              <li>
                <a href="/api/posts/deleted">Deleted post API</a> - 410 Gone
              </li>
              <li>
                <a href="/api/posts/nonexistent">Nonexistent post API</a> - 404
                Not Found
              </li>
            </ul>
          </div>
        </div>
      </main>

      <style jsx>{`
        .container {
          min-height: 100vh;
          padding: 0 0.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        main {
          padding: 5rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        .grid {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          flex-wrap: wrap;
          max-width: 800px;
          margin-top: 3rem;
        }

        .card {
          margin: 1rem;
          padding: 1.5rem;
          text-align: left;
          color: inherit;
          text-decoration: none;
          border: 1px solid #eaeaea;
          border-radius: 10px;
          transition:
            color 0.15s ease,
            border-color 0.15s ease;
          width: 100%;
          max-width: 350px;
        }

        h1 {
          margin: 0;
          line-height: 1.15;
          font-size: 4rem;
          text-align: center;
        }

        h2 {
          margin: 0 0 1rem 0;
          font-size: 1.5rem;
        }
      `}</style>

      <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family:
            -apple-system,
            BlinkMacSystemFont,
            Segoe UI,
            Roboto,
            Oxygen,
            Ubuntu,
            Cantarell,
            Fira Sans,
            Droid Sans,
            Helvetica Neue,
            sans-serif;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
