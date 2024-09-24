import {
  defineConfig,
  defineGlobalStyles,
  defineRecipe,
  defineTextStyles,
} from "@pandacss/dev";

// https://panda-css.com/docs/theming/text-styles#defining-text-styles
export const textStyles = defineTextStyles({
  link: {
    description: "The classic link text style - used in demo links",
    value: {
      fontSize: "lg",
      fontFamily: "inter",
    },
  },
});

// https://panda-css.com/docs/concepts/recipes#config-recipe
export const linkRecipe = defineRecipe({
  className: "link",
  description: "The styles for the link component",
  base: {
    color: {
      _default: "gray.800",
      _osDark: "gray.100",
    },
    fontFamily: "inter",
  },
  variants: {
    size: {
      sm: { fontSize: "sm" },
      lg: { fontSize: "lg" },
    },
  },
  defaultVariants: {
    size: "lg",
  },
});

// https://panda-css.com/docs/concepts/writing-styles#global-styles
const globalCss = defineGlobalStyles({
  html: {
    bg: {
      _default: "white",
      _osDark: "black",
    },
    "& .icon": {
      ml: 2,
      fontSize: "lg",
      fontWeight: 700,
    },
  },
});

// https://panda-css.com/docs/references/config
export default defineConfig({
  // Whether to use css reset
  preflight: true,

  // Where to look for your css declarations
  include: ["./app/**/*.{js,jsx,ts,tsx}"],

  // Files to exclude
  exclude: [],

  // Useful for theme customization
  theme: {
    extend: {
      tokens: {
        fonts: {
          inter: { value: "var(--font-inter)" },
        },
      },
      recipes: {
        link: linkRecipe,
      },
      textStyles,
    },
  },

  // The output directory for your css system
  outdir: "styled-system",

  // Global styles
  globalCss,
});
