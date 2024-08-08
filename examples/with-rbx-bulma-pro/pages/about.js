import { Section, Title } from "rbx";
import Layout from "../components/Layout";

const AboutPage = () => (
  <Layout>
    <Section>
      <Title as="h2">About</Title>
      <ul>
        <li>Server-rendered by default</li>
        <li>Automatic code splitting for faster page loads</li>
        <li>Simple client-side routing (page based)</li>
        <li>Filesystem based router, including dynamic routes</li>
        <li>
          Webpack-based dev environment which supports Hot Module Replacement
          (HMR)
        </li>
        <li>Serverless support</li>
        <li>Customizable with your own Babel and Webpack configurations</li>
      </ul>
    </Section>
  </Layout>
);

export default AboutPage;
