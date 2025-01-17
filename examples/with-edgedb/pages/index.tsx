import React from "react";
import { GetServerSideProps } from "next";
import Layout from "../components/Layout";
import Post from "../components/Post";
import { PostProps } from "./blog/[id]";
import { client, e } from "../client";

type Props = {
  feed: PostProps[];
};

const Blog: React.FC<Props> = (props) => {
  return (
    <Layout>
      <div className="page">
        <h1>Published posts</h1>
        <main>
          {props.feed.length ? (
            props.feed.map((post) => (
              <div key={post.id} className="post">
                <Post post={post} />
              </div>
            ))
          ) : (
            <p>No blog posts yet.</p>
          )}
        </main>
      </div>
      <style jsx>{`
        .post {
          transition: box-shadow 0s ease-in;
          border: 2px solid #eee;
          border-radius: 8px;
        }

        .post:hover {
          box-shadow: 0px 2px 8px #ccc;
          border: 2px solid #727272;
        }

        .post + .post {
          margin-top: 1rem;
        }
      `}</style>
    </Layout>
  );
};

export const getServerSideProps: GetServerSideProps = async () => {
  const feed = await e
    .select(e.Post, (post) => ({
      id: true,
      title: true,
      content: true,
      authorName: true,
      publishedISO: true,
      filter: e.op("exists", post.published),
    }))
    .run(client);
  return {
    props: { feed },
  };
};

export default Blog;
