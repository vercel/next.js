
import Passage from "@passageidentity/passage-node";
import { GetServerSideProps, GetServerSidePropsContext, NextPage } from "next";
import Link from "next/link"
import { ReactNode, useEffect } from "react";
import styles from '../styles/App.module.css'



interface DashboardProps {
  isAuthorized: boolean;
  username: string;
  appID: string;
};

const Dashboard: NextPage<DashboardProps> = ({ isAuthorized, username, appID }) => {

  useEffect(() => {
    require('@passageidentity/passage-elements/passage-profile');
  }, []);

  const authorizedBody =
    <>
      <p>You successfully signed in with Passage.</p>

      <p>Your username is: <b>{username}</b></p>

      <p><passage-profile app-id={appID}></passage-profile></p>

    </>

  const unauthorizedBody =
    <>
      You have not logged in and cannot view the dashboard.
      <br /> <br />

      <Link href="/" className={styles.link}>Login to continue.</Link>
    </>


  return (
    <div className={styles.mainContainer}>
      <div className={styles.dashboard}>
        <div className={styles.title}>{isAuthorized ? 'Welcome!' : 'Unauthorized'}</div>
        <div className={styles.message}>
          {isAuthorized ? authorizedBody : unauthorizedBody}
        </div>

      </div>
    </div>


  )
}

export const getServerSideProps: GetServerSideProps<DashboardProps> = async (context: GetServerSidePropsContext) => {
  // getServerSideProps runs server-side only and will never execute on the client browser
  // this allows the safe use of a private Passage API Key
  const passage = new Passage({
    appID: process.env.PASSAGE_APP_ID!,
    apiKey: process.env.PASSAGE_API_KEY!,
    authStrategy: "HEADER",
  });
  try {
    const authToken = context.req.cookies['psg_auth_token'];
    const req = {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    };
    const userID = await passage.authenticateRequest(req);
    if (userID) {
      // user is authenticated
      const { email, phone } = await passage.user.get(userID);
      const identifier = email ? email : phone;
      return { props: { isAuthorized: true, username: identifier, appID: passage.appID } };
    }
  } catch (error) {
    // authentication failed
    return { props: { isAuthorized: false, username: '', appID: passage.appID } };
  }
}


export default Dashboard

