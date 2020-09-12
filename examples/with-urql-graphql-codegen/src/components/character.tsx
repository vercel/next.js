import { useCharacterQuery } from '../generated/graphql';
import { useRouter } from 'next/router';

const Character: React.FC = () => { 
  const router = useRouter()
  const [{ data, fetching }] = useCharacterQuery({
    variables: {
      id: router.query.id as string
    }
  });
  
  if (fetching) return <p>Loading...</p>;

  return (
    <div>
      <h1>{data.character.name}</h1>
      <img src={data.character.image} alt={data.character.name} />
    </div>
  );
}

export default Character;