import { useUser } from "@auth0/nextjs-auth0/client";
import Layout from "../components/layout";

const About = () => {
  const { user, isLoading } = useUser();

  return (
    <Layout user={user} loading={isLoading}>
      <h1>About</h1>
      <p>
        This project shows different ways to display Profile info: using{" "}
        <i>Client rendered</i>, <i>Server rendered</i>, and <i>API rendered</i>
      </p>
      <p>
        Navigating between this page and <i>Home</i> is always pretty fast.
        However, when you navigate to the <i>Server rendered profile</i> page it
        takes more time because it uses SSR to fetch the user and then to
        display it
      </p>
    </Layout>
  );
};

export default About;
