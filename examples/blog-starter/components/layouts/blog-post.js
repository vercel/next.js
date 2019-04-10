import React from "react";
import Layout from "./default";
import SyntaxHighlight from "../syntax-highlight";
import PublishedAt from "../utils/published-at";

function BlogPost({ meta, children }) {
  return (
    <Layout pageTitle={meta.title}>
      <SyntaxHighlight />
      <article>
        <header>
          <h1>{meta.title}</h1>

          <PublishedAt link={meta.path} date={meta.publishedAt} />
        </header>
        <div>{children}</div>
      </article>
      <style jsx>{`
        header {
          margin-bottom: 2em;
        }
      `}</style>
    </Layout>
  );
}

export default BlogPost;
