import React from "react";
import { Streamdown } from "streamdown";
import Link from "next/link";
import { PostProps } from "../pages/blog/[id]";

const Post: React.FC<{ post: PostProps }> = ({ post }) => {
  return (
    <Link href={`/blog/${post.id}`}>
      <div>
        <h2>{post.title}</h2>
        <small>By {post.authorName}</small>
        <br />
        <br />
        <Streamdown mode="static" className="streamdown">
          {post.content || ""}
        </Streamdown>
        <style jsx>{`
          div {
            color: inherit;
            padding: 2rem;
            cursor: pointer;
          }
          h2 {
            margin: 0px;
            padding-bottom: 4px;
          }
          small {
            color: #888;
          }
          .streamdown,
          .streamdown > p {
            margin: 0px;
          }
        `}</style>
      </div>
    </Link>
  );
};

export default Post;
