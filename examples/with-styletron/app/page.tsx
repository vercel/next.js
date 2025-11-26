// DOCUMENTATION: http://styletron.org

"use client";

import { styled, useStyletron } from "styletron-react";

// Statically styled component
const Title = styled("h1", {
  color: "red",
  fontSize: "82px",
});

// Dynamically styled component
const SubTitle = styled("h2", ({ $size }: { $size: number }) => ({
  color: "blue",
  fontSize: `${$size}px`,
}));

export default function Home() {
  // An alternative hook-based API
  const [css] = useStyletron();

  return (
    <div>
      <Title>Title</Title>
      <SubTitle $size={50}>Subtitle</SubTitle>
      <p className={css({ fontSize: "32px" })}>Styled by hook</p>
    </div>
  );
}
