export type ProgressEvent = {
  type: "step" | "retry" | "sleep" | "done";
  message: string;
  at: string;
};
