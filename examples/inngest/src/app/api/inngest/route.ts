import { serve } from "inngest/next";
import { inngest } from "@/inngest/inngest.client";
import { helloWorld } from "@/inngest/functions/hello-world";

export const { GET, POST, PUT } = serve(inngest, [helloWorld]);
