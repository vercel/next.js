import { useCharactersQuery } from '../generated/graphql';
import Link from 'next/link';

const CharactersList: React.FC = () => {
  const [{ data, fetching }] = useCharactersQuery();

  if (fetching) return <p>Loading...</p>;

  return (
    <ul>
      {data.characters.results.map(({ id, name }) => (
        <li key={id}>
          <Link href="/character/[id]" as={`/character/${id}`}>
            <a>{name}</a>
          </Link>
        </li>
      ))}
    </ul>
  );
};

export default CharactersList;
