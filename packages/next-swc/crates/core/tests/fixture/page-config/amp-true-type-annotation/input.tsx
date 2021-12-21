import type { PageConfig } from "next"

export const config: PageConfig = {
  amp: true,
}

function About(props) {
  return <h3>My AMP About Page!</h3>
}

export default About
