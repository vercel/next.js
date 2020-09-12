import { GetServerSideProps } from 'next';
import { getClient } from '../lib/urql';
import { CharactersDocument } from '../generated/graphql';

import CharactersList from '../components/characters-list';

const Home: React.FC = () => {
  return (
    <>
      <h1>Characters</h1>
      <CharactersList />
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async ctx => {
  const client = getClient();
  await client.query(CharactersDocument).toPromise();

  return {
    props: {}
  };
};

export default Home;
