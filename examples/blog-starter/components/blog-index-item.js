import Link from "next/link";
import React from "react";
import PublishedAt from "./utils/published-at";

const Post = ({ title, summary, date, path }) => (
  <>
    <article className="post">
      <header className="post-header">
        <h2 className="post-title">
          <Link href={path}>
            <a>{title}</a>
          </Link>
        </h2>

        <PublishedAt link={path} date={date} />
      </header>

      <div className="post-summary">{summary}</div>
    </article>
    <style jsx>{`
      header {
        margin-bottom: 1em;
      }

      .post-title {
        margin-top: 0;
      }

      .post-title a {
        color: #313131;
      }

      .post:not(:last-child) {
        margin-bottom: 3em;
      }
    `}</style>
  </>
);

export default Post;
