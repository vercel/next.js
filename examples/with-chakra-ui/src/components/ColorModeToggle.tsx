"use client";

import { useTheme } from "next-themes";
import { LuMoon, LuSun } from "react-icons/lu";
import { Box, ClientOnly, IconButton, Skeleton } from "@chakra-ui/react";

const ColorModeToggle = () => {
  const { theme, setTheme } = useTheme();

  const toggleColorMode = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <Box position="absolute" top="4" right="4">
      <ClientOnly fallback={<Skeleton w="10" h="10" rounded="md" />}>
        <IconButton
          colorPalette="green"
          aria-label="toggle color mode"
          onClick={toggleColorMode}
        >
          {theme === "light" ? <LuMoon fill="white" /> : <LuSun />}
        </IconButton>
      </ClientOnly>
    </Box>
  );
};

export default ColorModeToggle;
