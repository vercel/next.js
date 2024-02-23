// Package imports
import Image from "next/image";

// Layout imports
import styles from "./Hero.module.css";
import { fetchGraphQL } from "@/utils/fetchGraphQL";
import { Page } from "@/gql/graphql";

async function getData(id: number) {
  const { hero } = await fetchGraphQL<{ hero: Page }>(
    `
          query($id: ID!) {
            hero: contentNode(id: $id, idType: DATABASE_ID) {
              ... on Page {
                title
                excerpt
                featuredImage {
                  node {
                    altText
                    mediaDetails {
                      width
                      height
                    }
                    sourceUrl
                  }
                }
              }
            }
          }
        `,
    {
      id,
    },
  );

  return hero;
}

export default async function Hero({ id }: { id: number }) {
  const hero = await getData(id);

  if (!hero) return null;

  return (
    <div className={styles.hero}>
      <h1>{hero.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: hero.content || "" }} />
      <Image
        src={hero?.featuredImage?.node?.sourceUrl ?? ""}
        alt={hero?.featuredImage?.node?.altText ?? ""}
        width={hero?.featuredImage?.node?.mediaDetails?.width ?? 0}
        height={hero?.featuredImage?.node?.mediaDetails?.height ?? 0}
      />
    </div>
  );
}
