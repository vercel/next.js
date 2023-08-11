import { Role, Schema } from "@iamjs/core";
import { NextRoleManager } from "@iamjs/next";
import { useAuthorization } from "@iamjs/react";

export const roles = {
  admin: new Role({
    name: "admin",
    description: "This role can do anything",
    config: {
      posts: {
        base: "crudl",
      },
    },
  }),
  editor: new Role({
    name: "editor",
    description: "This role can edit posts, can't delete them",
    config: {
      posts: {
        base: "cru-l",
      },
    },
  }),
  viewer: new Role({
    name: "viewer",
    description: "This role can view posts",
    config: {
      posts: {
        base: "-r--l",
      },
    },
  }),
};

export type Roles = keyof typeof roles | (string & {});

export const schema = new Schema({
  roles,
});

export const acl = new NextRoleManager({
  schema,
});

export const useAuth = () => {
  return useAuthorization(schema);
};
