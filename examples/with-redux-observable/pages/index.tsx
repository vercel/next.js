import type { GetServerSideProps } from "next";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import CharacterInfo from "../components/CharacterInfo";
import { startFetchingCharacters } from "../redux/actions";

/**
 * The key fix for issue #15971: We use getServerSideProps to fetch the
 * initial character data on the server. This ensures the first character
 * is rendered in the HTML response, even with JavaScript disabled.
 *
 * Previously, the example relied solely on client-side epic dispatching,
 * which meant the initial render had empty fields.
 */
export const getServerSideProps: GetServerSideProps = async () => {
  const id = Math.floor(Math.random() * 82) + 1;
  const response = await fetch(`https://swapi.dev/api/people/${id}/`);
  const data = await response.json();

  return {
    props: {
      initialReduxState: {
        name: data.name ?? "",
        height: data.height ?? "",
        mass: data.mass ?? "",
        hair_color: data.hair_color ?? "",
        skin_color: data.skin_color ?? "",
        eye_color: data.eye_color ?? "",
        gender: data.gender ?? "",
        fetchedOnServer: true,
        error: null,
      },
    },
  };
};

export default function IndexPage() {
  const dispatch = useDispatch();

  useEffect(() => {
    // Start fetching new characters every 3 seconds on the client
    dispatch(startFetchingCharacters());
  }, [dispatch]);

  return <CharacterInfo />;
}
