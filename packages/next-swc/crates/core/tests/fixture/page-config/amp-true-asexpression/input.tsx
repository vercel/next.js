import type { PageConfig } from "next"

export const config = {
  amp: true,
} as PageConfig

function About(props) {
  return <h3>My AMP About Page!</h3>
}

export default About
