
import { GetStaticProps, NextPage } from 'next'
import { useEffect } from 'react';

interface AppProps {
appID: string;
};


const Index: NextPage<AppProps> = ({appID}) => {

  useEffect(()=>{
    require('@passageidentity/passage-elements/passage-auth');
}, []);

  return (
    <>
      <passage-auth app-id={appID}></passage-auth>
    </>
  )
}

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {
      appID: process.env.PASSAGE_APP_ID
    }
  };
}

export default Index