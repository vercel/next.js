import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const breakpoints = {
  sm: "40em",
  md: "52em",
  lg: "64em",
  xl: "80em",
};

const theme = defineConfig({
  theme: {
    semanticTokens: {
      colors: {
        text: {
          value: {
            _light: "#16161D",
            _dark: "#ade3b8",
          },
        },
        heroGradientStart: {
          value: {
            _light: "#7928CA",
            _dark: "#e3a7f9",
          },
        },
        heroGradientEnd: {
          value: {
            _light: "#FF0080",
            _dark: "#fbec8f",
          },
        },
        black: { value: "#16161D" },
      },
    },
    breakpoints,
  },
});

export default createSystem(defaultConfig, theme);
