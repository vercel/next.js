import App from "../components/app";
import Header from "../components/header";
import PostList from "../components/post-list";
import React from "react";
import styled from "styled-components";

const Title = styled.h1`
  color: pink;
  font-size: 50px;
`;

export default () => (
  <App>
    <Title>My page</Title>
    <Header />
    <PostList />
  </App>
);
