import { createTheme, style } from "@vanilla-extract/css";

export const [ themeClass, vars ] = createTheme({
  color: {
    primary: "#222"
  },
  font: {
    body: "sans-serif"
  }
})

export const header = style({
  boxSizing: "border-box",
  margin: 0,
  backgroundColor: vars.color.primary,
  padding: 8
})

export const headingOne = style({
  color:  "white",
  fontFamily: vars.font.body,
})
