import { styled } from "@linaria/react";
import { ClientComponent } from "./ClientComponent";
import { ServerComponent } from "./ServerComponent";

const Container = styled.div`
  padding: 20px;
  background-color: #f0f0f0;
  border-radius: 8px;
`;

export default function Home() {
  return (
    <Container>
      Zero runtime CSS in JS
      <ServerComponent />
      <ClientComponent />
    </Container>
  );
}
