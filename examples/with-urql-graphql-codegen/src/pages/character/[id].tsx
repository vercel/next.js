import { GetServerSideProps } from 'next';
import { getClient } from '../../lib/urql';
import {
  CharacterDocument,
  CharacterQueryVariables
} from '../../generated/graphql';

import Character from '../../components/character';

const CharacterPage: React.FC = () => {
  return (
    <>
      <h1>Character</h1>
      <Character />
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const client = getClient();
  await client
    .query<any, CharacterQueryVariables>(CharacterDocument, {
      id: params.id as string
    })
    .toPromise();

  return {
    props: {}
  };
};

export default CharacterPage;
