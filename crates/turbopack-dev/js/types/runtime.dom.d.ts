export type ChunkResolver = {
  resolved: boolean;
  resolve: () => void;
  reject: (error?: Error) => void;
  promise: Promise<void>;
};
