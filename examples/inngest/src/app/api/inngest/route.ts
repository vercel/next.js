import { inngestConfig } from "@/inngest/inngest.config";
import { serve } from "inngest/next";

export const { GET, POST, PUT } = serve(inngestConfig);
