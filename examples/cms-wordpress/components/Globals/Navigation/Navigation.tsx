// Package imports
import Link from "next/link";

// Layout imports
import styles from "./Navigation.module.css";

// Type imports
import { MenuItem, RootQueryToMenuItemConnection } from "@/gql/graphql";
import { fetchGraphQL } from "@/utils/fetchGraphQL";

async function getData() {
  // Fetch navigation data from API
  const { menuItems } = await fetchGraphQL<{
    menuItems: RootQueryToMenuItemConnection;
  }>(
    `query {
      menuItems(where: {location: PRIMARY_MENU}) {
        nodes {
          uri
          target
          label
        }
      }
    }
    `,
  );

  if (menuItems === null) {
    throw new Error("Failed to fetch data");
  }

  return menuItems;
}

export default async function Navigation() {
  const menuItems = await getData();

  return (
    <nav
      className={styles.navigation}
      role="navigation"
      itemScope
      itemType="http://schema.org/SiteNavigationElement"
    >
      {menuItems.nodes.map((item: MenuItem, index: number) => {
        if (!item.uri) return null;

        return (
          <Link
            itemProp="url"
            href={item.uri}
            key={index}
            target={item.target || "_self"}
          >
            <span itemProp="name">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
