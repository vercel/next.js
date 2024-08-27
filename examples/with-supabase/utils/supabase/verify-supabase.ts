import { createClient } from "@/utils/supabase/server";

const canVerifySupabaseClient = () => {
  // This function is just for the interactive tutorial.
  // Feel free to remove it once you have Supabase connected.
  try {
    createClient();
    return true;
  } catch (e) {
    return false;
  }
};

export const verifySupabase = canVerifySupabaseClient();
