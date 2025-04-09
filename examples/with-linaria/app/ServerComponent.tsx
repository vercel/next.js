import { styled } from "@linaria/react";

const Title = styled.h1`
  font-size: 24px;
  font-weight: bold;
  background-color: lightblue;
  border-radius: 8px;
  padding: 8px;
`;

export const ServerComponent = () => {
  return <Title>Styled Server Component</Title>;
};
