import {  Title2, makeStyles, tokens} from '@fluentui/react-components';
import type { NextPage } from 'next';
import {Data} from '../components/Data'
import {Panels} from '../components/Panel'
import Head from 'next/head';
import { Fluent48Regular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    flexWrap:'wrap',
    textAlign:'center',
    marginBottom:"100px",
    alignItems:'center',
  },
  field: {
    display: "grid",
    gridRowGap: tokens.spacingVerticalS,
  },
});

const Home: NextPage = (props) => {
  const styles = useStyles();
  return (
    <>
      <Head>
        <title>Fluent UI App</title>
      </Head>
      <div className={styles.container}>
        <Fluent48Regular/>
        <Title2>Next.js + Fluent UI Template</Title2>
      </div>
      <Data/>
      <Panels/>
    </>
  );
};

export default Home;