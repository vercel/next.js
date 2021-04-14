import { Theme } from "reflexjs"

const theme: Theme = {
  useRootStyles: true,
  initialColorModeName: "light",
  colors: {
    text: "#191924",
    textLighter: "#60696f",
    link: "#06f",
    background: "#fff",
    heading: "#07070a",
    primary: "#06f",
    primaryHover: "#005ae0",
    secondary: "#D81159",
    secondaryHover: "#D81159",
    accent: "#fb3640",
    accentHover: "#fa0f1b",
    selection: "#ff70a0",
    muted: "#fafafa",
    mutedHover: "#f1f1f1",
    border: "#ebece9",
    borderHover: "#b9bdb3",
    prism: {
      text: "#000000",
      background: "#f6f8fa",
      comment: "#095a02",
      string: "#a62815",
      var: "#095a02",
      number: "#095a02",
      constant: "#007faa",
      keyword: "#2f00ff",
      function: "#000000",
      punctuation: "#000000",
      className: "#d91e18",
      tag: "#000000",
      boolean: "#2f00ff",
      property: "#7d0b00",
      namespace: "#2f00ff",
      deleted: "#a62815",
      inserted: "#095a02",
      highlight: "#e5ebf1",
      file: "#1c495c",
      lineNumber: "#1c495c",
    },
    modes: {
      dark: {
        text: "#ededee",
        textLighter: "#d6deeb",
        link: "#ff94bc",
        background: "#1a202c",
        heading: "#fff",
        primary: "#06f",
        primaryHover: "#005ae0",
        secondary: "#9e0c41",
        secondaryHover: "#850a37",
        accent: "#fb3640",
        accentHover: "#fa0f1b",
        selection: "#ff70a0",
        muted: "#2a2a3c",
        mutedHover: "#212130",
        border: "#2a2a3c",
        borderHover: "#434360",
        prism: {
          text: "#d6deeb",
          background: "#011627",
          comment: "#88ac89",
          string: "rgb(173, 219, 103)",
          var: "rgb(214, 222, 235)",
          number: "rgb(247, 140, 108)",
          constant: "rgb(130, 170, 255)",
          keyword: "rgb(127, 219, 202)",
          function: "rgb(130, 170, 255)",
          punctuation: "rgb(199, 146, 234)",
          className: "rgb(255, 203, 139)",
          tag: "rgb(127, 219, 202)",
          boolean: "rgb(255, 88, 116)",
          property: "rgb(128, 203, 196)",
          namespace: "rgb(178, 204, 214)",
          deleted: "#f88484",
          inserted: "rgb(173, 219, 103)",
          highlight: "hsl(207, 94%, 12%)",
          file: "#89a8a8",
          lineNumber: "#89a8a8",
        },
      },
    },
  },
  breakpoints: ["640px", "768px", "1024px", "1280px"],
  fonts: {
    body:
      "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji",
    heading: "inherit",
    monospace:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
  },
  fontSizes: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
    "5xl": "3rem",
    "6xl": "4rem",
  },
  fontWeights: {
    hairline: 100,
    thin: 200,
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },
  letterSpacings: {
    tighter: "-0.05em",
    tight: "-0.025em",
    normal: "0",
    wide: "0.025em",
    wider: "0.05em",
    widest: "0.1em",
  },
  lineHeights: {
    none: "1",
    tight: "1.25",
    snug: "1.375",
    normal: "1.5",
    relaxed: "1.625",
    loose: "2",
    3: ".75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    7: "1.75rem",
    8: "2rem",
    9: "2.25rem",
    10: "2.5rem",
  },
  space: {
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    7: "1.75rem",
    8: "2rem",
    9: "2.25rem",
    10: "2.5rem",
    12: "3rem",
    14: "3.5rem",
    16: "4rem",
    18: "4.5rem",
    20: "5rem",
    22: "5.5rem",
    24: "6rem",
    26: "6.5rem",
    28: "7rem",
    30: "7.5rem",
    32: "8rem",
    36: "9rem",
    40: "10rem",
    48: "12rem",
    56: "14rem",
    64: "16rem",
    72: "18rem",
    80: "20rem",
  },
  sizes: {
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    7: "1.75rem",
    8: "2rem",
    9: "2.25rem",
    10: "2.5rem",
    12: "3rem",
    14: "3.5rem",
    16: "4rem",
    18: "4.5rem",
    20: "5rem",
    22: "5.5rem",
    24: "6rem",
    26: "6.5rem",
    28: "7rem",
    30: "7.5rem",
    32: "8rem",
    36: "9rem",
    40: "10rem",
    48: "12rem",
    56: "14rem",
    64: "16rem",
    72: "18rem",
    80: "20rem",
    auto: "auto",
    half: "50%",
    full: "100%",
    screen: "100vw",
  },
  borders: [
    0,
    "1px solid",
    "2px solid",
    "3px solid",
    "4px solid",
    "5px solid",
    "6px solid",
    "7px solid",
    "8px solid",
    "9px solid",
    "10px solid",
  ],
  radii: {
    none: "0",
    sm: "0.125rem",
    md: "0.25rem",
    lg: "0.375rem",
    xl: "0.5rem",
    "2xl": "1rem",
    "3xl": "1.5rem",
    "4xl": "2rem",
    full: "9999px",
  },
  shadows: {
    none: "none",
    xs: "0 0 0 1px rgba(0, 0, 0, 0.05)",
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    md: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
    lg: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    xl:
      "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
    "2xl":
      "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    "3xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    inner: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)",
    outline: "0 0 0 3px rgba(66, 153, 225, 0.5)",
  },
  gridTemplateColumns: {
    none: "none",
    1: "repeat(1, minmax(0, 1fr))",
    2: "repeat(2, minmax(0, 1fr))",
    3: "repeat(3, minmax(0, 1fr))",
    4: "repeat(4, minmax(0, 1fr))",
    5: "repeat(5, minmax(0, 1fr))",
    6: "repeat(6, minmax(0, 1fr))",
    7: "repeat(7, minmax(0, 1fr))",
    8: "repeat(8, minmax(0, 1fr))",
    9: "repeat(9, minmax(0, 1fr))",
    10: "repeat(10, minmax(0, 1fr))",
    11: "repeat(11, minmax(0, 1fr))",
    12: "repeat(12, minmax(0, 1fr))",
  },
  gridTemplateRows: {
    none: "none",
    1: "repeat(1, minmax(0, 1fr))",
    2: "repeat(2, minmax(0, 1fr))",
    3: "repeat(3, minmax(0, 1fr))",
    4: "repeat(4, minmax(0, 1fr))",
    5: "repeat(5, minmax(0, 1fr))",
    6: "repeat(6, minmax(0, 1fr))",
  },
  styles: {
    root: {
      fontFamily: "body",
      fontSize: 16,
      lineHeight: "normal",
      fontFeatureSettings: "'kern'",
      textRendering: "optimizeLegibility",
      WebkitFontSmoothing: "antialiased",
      "*": {
        listStyle: "none",
        border: "0 solid",
        borderColor: "border",
        m: 0,
        p: 0,

        "::selection": {
          bg: "selection",
        },
      },
      body: {
        color: "text",
        fontFamily: "body",
        fontWeight: "normal",
        fontSize: "md",
        lineHeight: "relaxed",
        letterSpacing: "normal",
      },
      a: {
        color: "link",
        textDecoration: "inherit",
        "&:hover": {
          textDecoration: "underline",
        },
      },
      button: {
        bg: "transparent",
        backgroundImage: "none",
      },
      "img, video": {
        maxWidth: "100%",
        height: "auto",
      },
      hr: {
        borderTopWidth: 1,
      },
      "pre, code, kbd, samp": {
        fontFamily: "monospace",
        m: 0,
      },
    },
    code: {
      variant: "text.code",
    },
    inlineCode: {
      variant: "text.pre",
      color: "primary",
    },
  },
  text: {
    color: "text",
    fontFamily: "body",
    lead: {
      fontSize: "2xl",
      lineHeight: "normal",
      fontWeight: "normal",
    },
    paragraph: {
      fontSize: "lg",
      my: 8,
      lineHeight: 8,
    },
    sm: {
      fontSize: "sm",
      my: 4,
      lineHeight: "normal",
    },
    link: {
      color: "link",
      textDecoration: "none",

      "&:hover, &:focus": {
        color: "link",
        textDecoration: "underline",
      },
    },
    blockquote: {
      borderLeftWidth: 5,
      pl: 8,
      py: 1,
      my: 8,

      p: {
        m: 0,
        fontWeight: "semibold",
        fontStyle: "italic",
      },

      cite: {
        fontWeight: "normal",
        mt: 4,
        display: "inline-block",
      },
    },
    code: {
      fontFamily: "monospace",
      color: "link",
      backgroundColor: "prism.background",
      fontSize: "md",
      p: "0 .2em",
      borderRadius: "md",
      borderWidth: "1px",
      borderColor: "border",
    },
    caption: {
      textAlign: "center",
      mt: 4,
      fontSize: "sm",
      color: "textLighter",
    },
    pre: {
      color: "prism.text",
      backgroundColor: "prism.background",
      fontFamily: "monospace",
      fontSize: "sm",
      lineHeight: 6,
      tabSize: 2,
      hyphens: "none",
      my: 8,
      py: 4,
      overflow: "auto",
      borderRadius: "md",
      whiteSpace: "pre",
      ".plain": {
        minHeight: "1ch",
        display: "inline-block",
      },
      ".tag": {
        color: "prism.tag",
      },
      ".attr-name": {
        fontStyle: "italic",
      },
      ".comment": {
        color: "prism.comment",
        fontStyle: "italic",
      },
      ".attr-name, .string, .url": {
        color: "prism.string",
      },
      ".variable": {
        color: "prism.var",
      },
      ".number": {
        color: "prism.number",
      },
      ".builtin, .char, .constant": {
        color: "prism.constant",
      },
      ".function": {
        color: "prism.function",
      },
      ".punctuation, .selector, .doctype": {
        color: "prism.punctuation",
      },
      ".class-name": {
        color: "prism.className",
      },
      ".operator, .keyword": {
        color: "prism.keyword",
      },
      ".boolean": {
        color: "prism.boolean",
      },
      ".property": {
        color: "prism.property",
      },
      ".namespace": {
        color: "prism.namespace",
      },
      ".highlight": {
        bg: "prism.highlight",
      },
      ".deleted": {
        color: "prism.deleted",
      },
      ".inserted": {
        color: "prism.inserted",
      },
    },
  },
  subheading: {
    color: "textLighter",
    textTransform: "uppercase",
    m: 0,
  },
  heading: {
    color: "heading",
    fontFamily: "heading",
    fontWeight: "semibold",
    lineHeight: "tight",
    letterSpacing: "tight",

    h1: {
      fontSize: "5xl|6xl",
      fontWeight: "bold",
      lineHeight: "1.1",
    },
    h2: {
      fontSize: "3xl|4xl",
    },
    h3: {
      fontSize: "2xl",
    },
    h4: {
      fontSize: "xl",
      letterSpacing: "normal",
    },
    h5: {
      fontSize: "lg",
      fontFamily: "body",
      letterSpacing: "normal",
    },
    h6: {
      fontSize: "sm",
      fontFamily: "body",
      textTransform: "uppercase",
      letterSpacing: "normal",
    },
  },

  container: {
    px: "6|6|6|4",
    mx: "auto",
    maxWidth: 1280,

    sm: {
      maxWidth: 670,
    },

    md: {
      maxWidth: 768,
    },

    lg: {
      maxWidth: 1024,
    },

    xl: {
      maxWidth: 1280,
    },
  },

  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "text",
    bg: "muted",
    fontFamily: "body",
    fontSize: "md",
    fontWeight: "medium",
    lineHeight: "none",
    textDecoration: "none",
    border: "1px solid",
    borderColor: "border",
    borderRadius: "md",
    px: 4,
    py: 3,
    cursor: "pointer",
    transition: "all .15s ease-in",
    h: 12,

    ":hover, :focus": {
      transform: "translateY(-2px)",
      boxShadow: "lg",
    },

    sm: {
      px: 3,
      py: 2,
      fontSize: "sm",
      h: 8,

      svg: {
        size: 4,
      },
    },

    lg: {
      px: 5,
      py: 4,
      fontSize: "xl",
      h: 14,

      svg: {
        size: 8,
      },
    },

    muted: {
      bg: "muted",
      color: "text",
      borderColor: "muted",

      "&:hover, &:focus": {
        bg: "mutedHover",
        color: "text",
        borderColor: "mutedHover",
      },
    },

    primary: {
      bg: "primary",
      color: "white",
      borderColor: "primary",

      "&:hover, &:focus": {
        bg: "primaryHover",
        color: "white",
        borderColor: "primaryHover",
        transform: "translateY(-2px)",
        boxShadow: "lg",
      },
    },

    secondary: {
      bg: "secondary",
      color: "white",
      borderColor: "secondary",

      "&:hover, &:focus": {
        bg: "secondaryHover",
        color: "white",
        borderColor: "secondaryHover",
        transform: "translateY(-2px)",
        boxShadow: "lg",
      },
    },

    accent: {
      bg: "accent",
      color: "white",
      borderColor: "accent",

      "&:hover, &:focus": {
        bg: "accentHover",
        color: "white",
        borderColor: "accentHover",
        transform: "translateY(-2px)",
        boxShadow: "lg",
      },
    },

    link: {
      bg: "transparent",
      color: "link",
      borderColor: "transparent",

      "&:hover, &:focus": {
        bg: "transparent",
        borderColor: "transparent",
        transform: "none",
        boxShadow: "none",
        textDecoration: "underline",
      },
    },

    icon: {
      bg: "transparent",
      color: "text",
      borderColor: "transparent",
      p: 2,

      "&:hover, &:focus": {
        bg: "muted",
        borderColor: "muted",
        transform: "none",
        boxShadow: "none",
        color: "link",
      },

      svg: {
        size: 6,
      },
    },
  },
  input: {
    bg: "muted",
    color: "text",
    fontFamily: "body",
    fontSize: "md",
    lineHeight: "none",
    borderWidth: 1,
    borderColor: "border",
    borderRadius: "md",
    px: 4,
    py: 3,
    width: "100%",
    h: 12,

    sm: {
      py: 2,
      fontSize: "sm",
      h: 8,
    },

    lg: {
      py: 4,
      fontSize: "xl",
      h: 14,
    },

    "&:focus": {
      borderColor: "primary",
      outline: "none",
    },

    "&[type=checkbox], &[type=radio]": {
      display: "none",

      "+ label": {
        display: "inline-flex",
        alignItems: "center",
        position: "relative",
        cursor: "pointer",

        "&:before": {
          content: "''",
          width: "14px",
          height: "14px",
          flex: "none",
          bg: "background",
          borderRadius: "sm",
          mr: 3,
          border: "2px solid",
          borderColor: "background",
          boxShadow: ({ colors }) => `0 0 0 1px ${colors.border}`,
        },
      },
    },

    "&:checked + label:before": {
      bg: "primary",
      boxShadow: ({ colors }) => `0 0 0 2px ${colors.primary}`,
    },

    "&[type=radio]": {
      "+ label": {
        "&:before": {
          borderRadius: "full",
        },
      },
    },
  },
  select: {
    variant: "input",
    pl: 4,
    pr: 12,
    py: 3,
    h: 12,
    appearance: "none",
    cursor: "pointer",
    width: "100%",
    backgroundImage:
      'url("data:image/svg+xml;base64,PHN2ZyBhcmlhLWhpZGRlbj0idHJ1ZSIgZm9jdXNhYmxlPSJmYWxzZSIgZGF0YS1wcmVmaXg9ImZhcyIgZGF0YS1pY29uPSJjYXJldC1kb3duIiBjbGFzcz0ic3ZnLWlubGluZS0tZmEgZmEtY2FyZXQtZG93biBmYS13LTEwIiByb2xlPSJpbWciIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDMyMCA1MTIiPjxwYXRoIGZpbGw9ImN1cnJlbnRDb2xvciIgZD0iTTMxLjMgMTkyaDI1Ny4zYzE3LjggMCAyNi43IDIxLjUgMTQuMSAzNC4xTDE3NC4xIDM1NC44Yy03LjggNy44LTIwLjUgNy44LTI4LjMgMEwxNy4yIDIyNi4xQzQuNiAyMTMuNSAxMy41IDE5MiAzMS4zIDE5MnoiPjwvcGF0aD48L3N2Zz4=")',
    backgroundPosition: "right 16px center",
    backgroundRepeat: "no-repeat",
    backgroundSize: 8,

    sm: {
      py: 2,
      fontSize: "sm",
      h: 8,
    },

    lg: {
      py: 4,
      fontSize: "xl",
      h: 14,
    },
  },

  textarea: {
    variant: "input",
  },

  fieldset: {
    border: "1px solid",
    borderColor: "border",
    borderRadius: "md",
  },

  table: {
    mt: 6,
    w: "full",
    borderCollapse: "collapse",

    "tr:hover": {
      bg: "muted",
    },
    "td, th": {
      borderBottomWidth: 1,
      p: 2,

      code: {
        fontSize: "md",
      },
    },
    th: {
      textAlign: "left",
      fontWeight: "semibold",
      bg: "muted",
    },
  },

  list: {
    variant: "text.paragraph",
    my: 6,
    ml: 10,

    li: {
      mb: 2,

      p: {
        m: 0,
      },
    },

    unordered: {
      "> li": {
        listStyle: "disc",
      },
    },

    ordered: {
      "> li": {
        listStyle: "decimal",
      },
    },
  },

  icons: {
    logo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  },
}

export default theme
