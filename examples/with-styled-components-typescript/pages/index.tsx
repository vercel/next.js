import React from "react";
import styled from "styled-components";

const Headline = styled.h1`
    text-align: center;
    font-size: 50px;
    margin-top: 50px;
`;

const Home: React.FC = () => {
    return <Headline>My page</Headline>;
};

export default Home;
