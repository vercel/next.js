import { Box, Button, css } from "@devup-ui/react";

const styles = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "2rem",
  p: "6rem",
  minH: "100vh",
});

export default function Home() {
  return (
    <main className={styles}>
      <Button>Click me</Button>
      <Box fontSize="2rem">
        Hello Devup UI
      </Box>
    </main>
  );
}
