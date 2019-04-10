import React from "react";
import Layout from "../components/layouts/default";
import Post from "../components/blog-index-item";
import blogposts from "../posts/index";

const Home = ({ url }) => {
  return (
    <Layout pageTitle="Home" path={url.pathname}>
      {blogposts.map((post, index) => (
        <Post
          key={index}
          title={post.title}
          summary={post.summary}
          date={post.publishedAt}
          path={post.path}
        />
      ))}
    </Layout>
  );
};

export default Home;
