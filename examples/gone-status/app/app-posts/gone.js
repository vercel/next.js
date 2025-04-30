// Custom Gone Page for app-posts section
export default function PostGone() {
  return (
    <div className="post-gone">
      <h1>Post Permanently Removed</h1>
      <p>
        This post has been permanently removed from our site and will not be
        available again.
      </p>
      <p>
        <a href="/app-posts/active">View an active post</a> or{" "}
        <a href="/">return to home</a>
      </p>

      <style jsx>{`
        .post-gone {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
          text-align: center;
          border: 1px solid #ffcdd2;
          border-radius: 5px;
          background-color: #ffebee;
        }

        h1 {
          color: #c62828;
        }

        a {
          color: #0070f3;
          text-decoration: none;
        }

        a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
