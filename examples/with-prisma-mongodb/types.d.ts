import { User as UserDB, Post as PostDB } from "./generated/prisma";

export type User = UserDB & {
  posts?: Post[];
};

export type Post = PostDB & {
  user?: User | null;
};
