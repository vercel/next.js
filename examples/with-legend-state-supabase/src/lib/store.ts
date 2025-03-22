import { createClient } from "@supabase/supabase-js";
import { configureSynced } from "@legendapp/state/sync";
import { observable } from "@legendapp/state";
import { ObservablePersistLocalStorage } from "@legendapp/state/persist-plugins/local-storage";
import { syncedSupabase } from "@legendapp/state/sync-plugins/supabase";
import { v4 as uuidv4 } from "uuid";

import { Database } from "./types";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const generateId = () => uuidv4();

const customSynced = configureSynced(syncedSupabase, {
  persist: {
    plugin: ObservablePersistLocalStorage,
  },
  generateId,
  supabase,
  changesSince: "last-sync",
  fieldCreatedAt: "created_at",
  fieldUpdatedAt: "updated_at",
  fieldDeleted: "deleted",
});

export const tasks$ = observable(
  customSynced({
    supabase,
    collection: "tasks",
    select: (from) =>
      from.select("id,counter,text,done,created_at,updated_at,deleted"),
    actions: ["read", "create", "update", "delete"],
    realtime: true,
    persist: {
      name: "tasks",
      retrySync: true,
    },
    retry: {
      infinite: true,
    },
  })
);

export const addTask = (text: string) => {
  const id = generateId();
  tasks$[id].assign({
    id,
    text,
  });
};

export const toggleDone = (id: string) => {
  tasks$[id].done.set((prev) => !prev);
};
