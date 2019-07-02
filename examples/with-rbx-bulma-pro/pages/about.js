import {Section, Title} from 'rbx';
import Layout from '../components/Layout';

const AboutPage = () => (
  <Layout>
    <Section>
      <Title as='h2'>About</Title>
      <p>That's exactly what we do with Next.js. Instead of PHP, we build the app with JavaScript and React. Here are some other cool features Next.js brings to the table:</p>
      <ul>
        <li>Server-rendered by default</li>
        <li>Automatic code splitting for faster page loads</li>
        <li>Simple client-side routing (page based)</li>
        <li>Webpack-based dev environment which supports Hot Module Replacement (HMR)</li>
        <li>Able to implement with Express or any other Node.js HTTP server</li>
        <li>Customizable with your own Babel and Webpack configurations</li>
      </ul>
    </Section>
  </Layout>
)

export default AboutPage;
