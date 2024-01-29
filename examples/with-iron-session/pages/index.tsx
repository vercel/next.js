import Layout from "components/Layout";
import Image from "next/image";

export default function Home() {
  return (
    <Layout>
      <h1>
        <span style={{ marginRight: ".3em", verticalAlign: "middle" }}>
          <Image src="/GitHub-Mark-32px.png" width="32" height="32" alt="" />
        </span>
        <a href="https://github.com/vvo/iron-session">iron-session</a> -
        Authentication example
      </h1>

      <p>
        This example creates an authentication system that uses a{" "}
        <b>signed and encrypted cookie to store session data</b>.
      </p>

      <p>
        It uses current best practices as for authentication in the Next.js
        ecosystem:
        <br />
        1. <b>no `getInitialProps`</b> to ensure every page is static
        <br />
        2. <b>`useUser` hook</b> together with `
        <a href="https://swr.vercel.app/">swr`</a> for data fetching
      </p>

      <h2>Features</h2>

      <ul>
        <li>Logged in status synchronized between browser windows/tabs</li>
        <li>Layout based on logged in status</li>
        <li>All pages are static</li>
        <li>Session data is signed and encrypted in a cookie</li>
      </ul>

      <h2>Steps to test the functionality:</h2>

      <ol>
        <li>Click login and enter your GitHub username.</li>
        <li>
          Click home and click profile again, notice how your session is being
          used through a token stored in a cookie.
        </li>
        <li>
          Click logout and try to go to profile again. You&apos;ll get
          redirected to the `/login` route.
        </li>
      </ol>
      <style jsx>{`
        li {
          margin-bottom: 0.5rem;
        }
      `}</style>
    </Layout>
  );
}
