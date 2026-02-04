import { Box, Text, Button, Divider } from "@gympass/yoga";

export default function Home() {
  return (
    <Box d="flex" flexDirection="column" alignItems="center">
      <Text.H2>@gympass/yoga with Next.js</Text.H2>
      <Divider />
      <Button>Yoga Design System</Button>
    </Box>
  );
}
