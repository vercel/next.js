export default function Header({ title }) {
  return (
    <header>
      <h1 className="title">
        {title ? (
          <span>{title}</span>
        ) : (
          <span>
            Welcome to <a href="https://nextjs.org">Next.js with Neo4j!</a>
          </span>
        )}
      </h1>

      <style jsx>{`
        .title a {
          color: #0070f3;
          text-decoration: none;
        }
        .title a:hover,
        .title a:focus,
        .title a:active {
          text-decoration: underline;
        }
        .title {
          font-size: 3rem;
          margin-bottom: 25px;
        }
        .title,
        .description {
          text-align: center;
        }
      `}</style>
    </header>
  );
}
