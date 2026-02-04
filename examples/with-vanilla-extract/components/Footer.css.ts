import { style } from "@vanilla-extract/css";

export const footer = style({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  position: "relative",
  bottom: "0",
  left: "0",
  width: "100%",
  textAlign: "center",
  padding: "48px",
  boxSizing: "border-box",
  fontSize: "16px",
  "@media": {
    "(min-width: 0px) and (max-width: 768px)": {
      flexDirection: "column",
      alignItems: "center",
      gap: "24px",
    },
  },
});

export const details = style({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  fontSize: "inherit",
  color: "#fff",
  margin: "auto",
});

export const link = style({
  height: "fit-content",
  color: "inherit",
  textDecorationThickness: "1px",
  textUnderlineOffset: "3px",
});
