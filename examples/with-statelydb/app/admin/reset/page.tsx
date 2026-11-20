"use server";

import { statelyClient } from "@/lib/stately";
import { keyPath } from "@stately-cloud/client";
import { redirect } from "next/navigation";

export default async function ResetPage() {
  
  const items = statelyClient.beginScan({ itemTypes: ["Character", "Channel", "Show"] });
  const itemsToDelete = [];
  for await (const item of items) {
    itemsToDelete.push(item);
  }
  
  // StatelyDB allows up to 50 items to be deleted in a single batch operation.
  const BATCH_SIZE = 50;
  for (let i = 0; i < itemsToDelete.length; i += BATCH_SIZE) {
    const itemBatch = itemsToDelete.slice(i, i + BATCH_SIZE);
    const keyPaths = itemBatch
      .map((item) => {
        if (statelyClient.isType(item, "Character")) {
          return keyPath`/character-${item.characterId}`;
        } else if (statelyClient.isType(item, "Show")) {
          return keyPath`/show-${item.showId}`;
        } else if (statelyClient.isType(item, "Channel")) {
          return keyPath`/channel-${item.channelId}`;
        }
        return undefined;
      })
      .filter((kp): kp is string => kp !== undefined);
    if (keyPaths.length) {
      await statelyClient.del(...keyPaths);
    }
  }

  // After deletion redirect home.
  redirect("/");
}
