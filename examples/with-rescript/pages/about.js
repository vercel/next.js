import AboutRes from "src/About.bs.js";

// Note:
// We need to wrap the make call with
// a Fast-Refresh conform function name,
// (in this case, uppercased first letter)
//
// If you don't do this, your Fast-Refresh will
// not work!
export default function About(props) {
  return <AboutRes {...props}/>;
}
