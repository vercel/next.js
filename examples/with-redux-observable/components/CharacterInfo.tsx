import { useSelector } from "react-redux";
import { CharacterState } from "../redux/reducer";

const CharacterInfo = () => {
  const character = useSelector((state: CharacterState) => state);

  return (
    <div>
      <h1>Star Wars Character</h1>
      {character.error ? (
        <p>Error: {character.error}</p>
      ) : (
        <ul>
          <li>Name: {character.name}</li>
          <li>Height: {character.height}</li>
          <li>Mass: {character.mass}</li>
          <li>Hair color: {character.hair_color}</li>
          <li>Skin color: {character.skin_color}</li>
          <li>Eye color: {character.eye_color}</li>
          <li>Gender: {character.gender}</li>
        </ul>
      )}
      <p>
        (was {character.fetchedOnServer ? "" : "not "}fetched on server)
      </p>
    </div>
  );
};

export default CharacterInfo;
