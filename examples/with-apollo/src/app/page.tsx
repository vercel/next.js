import { FiveRockets } from "@/components/FiveRocketsClient";
import { LatestMissionName } from "@/components/LatestMissionName";
import { Suspense } from "react";

export default async function Home() {
  return (
    <>
      <article>
        <h2>
          Latest mission: <LatestMissionName />
        </h2>
      </article>
      <article>
        <h2>Five Rockets:</h2>
        <Suspense fallback={<div>loading...</div>}>
          <FiveRockets />
        </Suspense>
      </article>
    </>
  );
}
