// TODO(port): blocked — the footer imported disclaimer.txt as a string.
//
// Vite loaded the raw file with a `?raw` import (vite-src/src/Footer.tsx).
// Next.js cannot import a text file as a string without adding a custom
// webpack loader, which we do not want to maintain. DO NOT paste the wording
// into this component: legal diffs the rendered footer against
// disclaimer.txt, so the txt file has to stay the single source of truth.

export default function Footer() {
  return <footer id="site-footer">{/* disclaimer text goes here */}</footer>
}
