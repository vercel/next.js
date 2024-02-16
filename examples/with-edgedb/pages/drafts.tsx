import React from "react";
import { GetServerSideProps } from "next";
import Layout from "../components/Layout";
import Post from "../components/Post";
import { PostProps } from "./blog/[id]";
import { client, e } from "../client";

type Props = {
  drafts: PostProps[];
};

const Drafts: React.FC<Props> = (props) => {
  return (
    <Layout>
      <div className="page">
        <h1>Drafts</h1>
        <main>
          {props.drafts.length
            ? props.drafts.map((post) => (
                <div key={post.id} className="post">
                  <Post post={post} />
                </div>
              ))
            : "No drafts yet."}
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
  const drafts = await e
    .select(e.Post, (post) => ({
      id: true,
      title: true,
      content: true,
      authorName: true,
      filter: e.op("not", e.op("exists", post.published)),
    }))
    .run(client);
  return {
    props: { drafts },
  };
};

export default Drafts;
