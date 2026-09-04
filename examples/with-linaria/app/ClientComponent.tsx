"use client";

import { styled } from "@linaria/react";
import { useState } from "react";

const Container = styled.div`
  background-color: lightgreen;
  border-radius: 8px;
  padding: 8px;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: bold;
`;

const Button = styled.button`
  background-color: #000;
  color: #fff;
  padding: 10px 20px;
  border-radius: 4px;
`;

const Counter = styled.p`
  font-size: 24px;
  font-weight: bold;
`;

export const ClientComponent = () => {
  const [count, setCount] = useState(0);
  return (
    <Container>
      <Title>Styled Client Component</Title>
      <Button onClick={() => setCount(count + 1)}>Click me</Button>
      <Counter>Count: {count}</Counter>
    </Container>
  );
};
