/* tslint:disable */
/* eslint-disable */
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL query operation: AllPosts
// ====================================================

export interface AllPosts_allPosts {
  __typename: "Post";
  id: string;
  title: string;
  votes: number | null;
  url: string;
  createdAt: any | null;
}

export interface AllPosts__allPostsMeta {
  __typename: "_QueryMeta";
  count: number;
}

export interface AllPosts {
  allPosts: AllPosts_allPosts[];
  _allPostsMeta: AllPosts__allPostsMeta;
}

export interface AllPostsVariables {
  first: number;
  skip: number;
}

/* tslint:disable */
/* eslint-disable */
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL mutation operation: UpdatePost
// ====================================================

export interface UpdatePost_updatePost {
  __typename: "Post";
  id: string;
  votes: number | null;
}

export interface UpdatePost {
  updatePost: UpdatePost_updatePost | null;
}

export interface UpdatePostVariables {
  id: string;
  votes?: number | null;
}

/* tslint:disable */
/* eslint-disable */
// This file was automatically generated and should not be edited.

// ====================================================
// GraphQL mutation operation: CreatePost
// ====================================================

export interface CreatePost_createPost {
  __typename: "Post";
  id: string;
  title: string;
  votes: number | null;
  url: string;
  createdAt: any | null;
}

export interface CreatePost {
  createPost: CreatePost_createPost | null;
}

export interface CreatePostVariables {
  title: string;
  url: string;
}

/* tslint:disable */
/* eslint-disable */
// This file was automatically generated and should not be edited.

//==============================================================
// START Enums and Input Objects
//==============================================================

//==============================================================
// END Enums and Input Objects
//==============================================================
