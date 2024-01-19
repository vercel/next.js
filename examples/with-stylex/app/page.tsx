import * as stylex from "@stylexjs/stylex";

export default function Home() {
  return (
    <main {...stylex.props(s.main)}>
      <div {...stylex.props(s.hero)}>
        <h1 {...stylex.props(s.h1)}>
          app dir with stylex
        </h1>
      </div>
    </main>
  );
}

const MEDIA_MOBILE: "@media (max-width: 700px)" = "@media (max-width: 700px)";

const s = stylex.create({
  main: {
    padding: 32,
    maxWidth: 700,
    margin: "auto",
  },
  code: {
    fontFamily: "monospace",
    fontSize: 18,
    fontWeight: 600,
    color: "#0070f3",
  },
  hero: {
    width: "100%",
    height: 320,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundSize: "contain",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
  },
  h1: {
    lineHeight: 1,
    fontWeight: 400,
    textAlign: "center",
    display: "flex",
    whiteSpace: "nowrap",
    flexDirection: {
      default: "row",
      [MEDIA_MOBILE]: "column",
    },
  },
});
