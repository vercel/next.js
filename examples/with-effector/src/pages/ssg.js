import { fork, serialize } from "effector";
import { Page } from "../components/page";
import { $lastUpdate, $light } from "../model";

export async function getStaticProps() {
  const scope = fork({
    values: [
      [$lastUpdate, Date.now()],
      [$light, false],
    ],
  });

  return {
    props: {
      initialEffectorState: serialize(scope),
    },
  };
}

export default function SSG() {
  return <Page />;
}
