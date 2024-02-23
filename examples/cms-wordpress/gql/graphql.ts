/* eslint-disable */
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
};

/** Avatars are profile images for users. WordPress by default uses the Gravatar service to host and fetch avatars from. */
export type Avatar = {
  __typename?: "Avatar";
  /** URL for the default image or a default type. Accepts &#039;404&#039; (return a 404 instead of a default image), &#039;retro&#039; (8bit), &#039;monsterid&#039; (monster), &#039;wavatar&#039; (cartoon face), &#039;indenticon&#039; (the &#039;quilt&#039;), &#039;mystery&#039;, &#039;mm&#039;, or &#039;mysteryman&#039; (The Oyster Man), &#039;blank&#039; (transparent GIF), or &#039;gravatar_default&#039; (the Gravatar logo). */
  default?: Maybe<Scalars["String"]["output"]>;
  /** HTML attributes to insert in the IMG element. Is not sanitized. */
  extraAttr?: Maybe<Scalars["String"]["output"]>;
  /** Whether to always show the default image, never the Gravatar. */
  forceDefault?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether the avatar was successfully found. */
  foundAvatar?: Maybe<Scalars["Boolean"]["output"]>;
  /** Height of the avatar image. */
  height?: Maybe<Scalars["Int"]["output"]>;
  /** Whether the object is restricted from the current viewer */
  isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
  /** What rating to display avatars up to. Accepts &#039;G&#039;, &#039;PG&#039;, &#039;R&#039;, &#039;X&#039;, and are judged in that order. */
  rating?: Maybe<Scalars["String"]["output"]>;
  /** Type of url scheme to use. Typically HTTP vs. HTTPS. */
  scheme?: Maybe<Scalars["String"]["output"]>;
  /** The size of the avatar in pixels. A value of 96 will match a 96px x 96px gravatar image. */
  size?: Maybe<Scalars["Int"]["output"]>;
  /** URL for the gravatar image source. */
  url?: Maybe<Scalars["String"]["output"]>;
  /** Width of the avatar image. */
  width?: Maybe<Scalars["Int"]["output"]>;
};

/** What rating to display avatars up to. Accepts 'G', 'PG', 'R', 'X', and are judged in that order. Default is the value of the 'avatar_rating' option */
export enum AvatarRatingEnum {
  /** Indicates a G level avatar rating level. */
  G = "G",
  /** Indicates a PG level avatar rating level. */
  Pg = "PG",
  /** Indicates an R level avatar rating level. */
  R = "R",
  /** Indicates an X level avatar rating level. */
  X = "X",
}

/** The category type */
export type Category = DatabaseIdentifier &
  HierarchicalNode &
  HierarchicalTermNode &
  MenuItemLinkable &
  Node &
  TermNode &
  UniformResourceIdentifiable & {
    __typename?: "Category";
    /** The ancestors of the node. Default ordered as lowest (closest to the child) to highest (closest to the root). */
    ancestors?: Maybe<CategoryToAncestorsCategoryConnection>;
    /**
     * The id field matches the WP_Post-&gt;ID field.
     * @deprecated Deprecated in favor of databaseId
     */
    categoryId?: Maybe<Scalars["Int"]["output"]>;
    /** Connection between the category type and its children categories. */
    children?: Maybe<CategoryToCategoryConnection>;
    /** Connection between the Category type and the ContentNode type */
    contentNodes?: Maybe<CategoryToContentNodeConnection>;
    /** The number of objects connected to the object */
    count?: Maybe<Scalars["Int"]["output"]>;
    /** The unique identifier stored in the database */
    databaseId: Scalars["Int"]["output"];
    /** The description of the object */
    description?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the TermNode type and the EnqueuedScript type */
    enqueuedScripts?: Maybe<TermNodeToEnqueuedScriptConnection>;
    /** Connection between the TermNode type and the EnqueuedStylesheet type */
    enqueuedStylesheets?: Maybe<TermNodeToEnqueuedStylesheetConnection>;
    /** The globally unique ID for the object */
    id: Scalars["ID"]["output"];
    /** Whether the node is a Content Node */
    isContentNode: Scalars["Boolean"]["output"];
    /** Whether the object is restricted from the current viewer */
    isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether the node is a Term */
    isTermNode: Scalars["Boolean"]["output"];
    /** The link to the term */
    link?: Maybe<Scalars["String"]["output"]>;
    /** The human friendly name of the object. */
    name?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the category type and its parent category. */
    parent?: Maybe<CategoryToParentCategoryConnectionEdge>;
    /** Database id of the parent node */
    parentDatabaseId?: Maybe<Scalars["Int"]["output"]>;
    /** The globally unique identifier of the parent node. */
    parentId?: Maybe<Scalars["ID"]["output"]>;
    /** Connection between the Category type and the post type */
    posts?: Maybe<CategoryToPostConnection>;
    /** The Yoast SEO data of the Categories taxonomy. */
    seo?: Maybe<TaxonomySeo>;
    /** An alphanumeric identifier for the object unique to its type. */
    slug?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the Category type and the Taxonomy type */
    taxonomy?: Maybe<CategoryToTaxonomyConnectionEdge>;
    /** The name of the taxonomy that the object is associated with */
    taxonomyName?: Maybe<Scalars["String"]["output"]>;
    /** The ID of the term group that this term object belongs to */
    termGroupId?: Maybe<Scalars["Int"]["output"]>;
    /** The taxonomy ID that the object is associated with */
    termTaxonomyId?: Maybe<Scalars["Int"]["output"]>;
    /** The unique resource identifier path */
    uri?: Maybe<Scalars["String"]["output"]>;
  };

/** The category type */
export type CategoryAncestorsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The category type */
export type CategoryChildrenArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<CategoryToCategoryConnectionWhereArgs>;
};

/** The category type */
export type CategoryContentNodesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<CategoryToContentNodeConnectionWhereArgs>;
};

/** The category type */
export type CategoryEnqueuedScriptsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The category type */
export type CategoryEnqueuedStylesheetsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The category type */
export type CategoryPostsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<CategoryToPostConnectionWhereArgs>;
};

/** Connection to category Nodes */
export type CategoryConnection = {
  /** A list of edges (relational context) between RootQuery and connected category Nodes */
  edges: Array<CategoryConnectionEdge>;
  /** A list of connected category Nodes */
  nodes: Array<Category>;
  /** Information about pagination in a connection. */
  pageInfo: CategoryConnectionPageInfo;
};

/** Edge between a Node and a connected category */
export type CategoryConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected category Node */
  node: Category;
};

/** Page Info on the connected CategoryConnectionEdge */
export type CategoryConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** The Type of Identifier used to fetch a single resource. Default is ID. */
export enum CategoryIdType {
  /** The Database ID for the node */
  DatabaseId = "DATABASE_ID",
  /** The hashed Global ID */
  Id = "ID",
  /** The name of the node */
  Name = "NAME",
  /** Url friendly name of the node */
  Slug = "SLUG",
  /** The URI for the node */
  Uri = "URI",
}

/** Connection between the Category type and the category type */
export type CategoryToAncestorsCategoryConnection = CategoryConnection &
  Connection & {
    __typename?: "CategoryToAncestorsCategoryConnection";
    /** Edges for the CategoryToAncestorsCategoryConnection connection */
    edges: Array<CategoryToAncestorsCategoryConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Category>;
    /** Information about pagination in a connection. */
    pageInfo: CategoryToAncestorsCategoryConnectionPageInfo;
  };

/** An edge in a connection */
export type CategoryToAncestorsCategoryConnectionEdge = CategoryConnectionEdge &
  Edge & {
    __typename?: "CategoryToAncestorsCategoryConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Category;
  };

/** Page Info on the &quot;CategoryToAncestorsCategoryConnection&quot; */
export type CategoryToAncestorsCategoryConnectionPageInfo =
  CategoryConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "CategoryToAncestorsCategoryConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Connection between the Category type and the category type */
export type CategoryToCategoryConnection = CategoryConnection &
  Connection & {
    __typename?: "CategoryToCategoryConnection";
    /** Edges for the CategoryToCategoryConnection connection */
    edges: Array<CategoryToCategoryConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Category>;
    /** Information about pagination in a connection. */
    pageInfo: CategoryToCategoryConnectionPageInfo;
  };

/** An edge in a connection */
export type CategoryToCategoryConnectionEdge = CategoryConnectionEdge &
  Edge & {
    __typename?: "CategoryToCategoryConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Category;
  };

/** Page Info on the &quot;CategoryToCategoryConnection&quot; */
export type CategoryToCategoryConnectionPageInfo = CategoryConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "CategoryToCategoryConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the CategoryToCategoryConnection connection */
export type CategoryToCategoryConnectionWhereArgs = {
  /** Unique cache key to be produced when this query is stored in an object cache. Default is 'core'. */
  cacheDomain?: InputMaybe<Scalars["String"]["input"]>;
  /** Term ID to retrieve child terms of. If multiple taxonomies are passed, $child_of is ignored. Default 0. */
  childOf?: InputMaybe<Scalars["Int"]["input"]>;
  /** True to limit results to terms that have no children. This parameter has no effect on non-hierarchical taxonomies. Default false. */
  childless?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Retrieve terms where the description is LIKE the input value. Default empty. */
  descriptionLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of term ids to exclude. If $include is non-empty, $exclude is ignored. Default empty array. */
  exclude?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term ids to exclude along with all of their descendant terms. If $include is non-empty, $exclude_tree is ignored. Default empty array. */
  excludeTree?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to hide terms not assigned to any posts. Accepts true or false. Default false */
  hideEmpty?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Whether to include terms that have non-empty descendants (even if $hide_empty is set to true). Default true. */
  hierarchical?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Array of term ids to include. Default empty array. */
  include?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of names to return term(s) for. Default empty. */
  name?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Retrieve terms where the name is LIKE the input value. Default empty. */
  nameLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of object IDs. Results will be limited to terms associated with these objects. */
  objectIds?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Direction the connection should be ordered in */
  order?: InputMaybe<OrderEnum>;
  /** Field(s) to order terms by. Defaults to 'name'. */
  orderby?: InputMaybe<TermObjectsConnectionOrderbyEnum>;
  /** Whether to pad the quantity of a term's children in the quantity of each term's "count" object variable. Default false. */
  padCounts?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Parent term ID to retrieve direct-child terms of. Default empty. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Search criteria to match terms. Will be SQL-formatted with wildcards before and after. Default empty. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of slugs to return term(s) for. Default empty. */
  slug?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomyId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to prime meta caches for matched terms. Default true. */
  updateTermMetaCache?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** Connection between the Category type and the ContentNode type */
export type CategoryToContentNodeConnection = Connection &
  ContentNodeConnection & {
    __typename?: "CategoryToContentNodeConnection";
    /** Edges for the CategoryToContentNodeConnection connection */
    edges: Array<CategoryToContentNodeConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<ContentNode>;
    /** Information about pagination in a connection. */
    pageInfo: CategoryToContentNodeConnectionPageInfo;
  };

/** An edge in a connection */
export type CategoryToContentNodeConnectionEdge = ContentNodeConnectionEdge &
  Edge & {
    __typename?: "CategoryToContentNodeConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: ContentNode;
  };

/** Page Info on the &quot;CategoryToContentNodeConnection&quot; */
export type CategoryToContentNodeConnectionPageInfo =
  ContentNodeConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "CategoryToContentNodeConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Arguments for filtering the CategoryToContentNodeConnection connection */
export type CategoryToContentNodeConnectionWhereArgs = {
  /** The Types of content to filter */
  contentTypes?: InputMaybe<Array<InputMaybe<ContentTypesOfCategoryEnum>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the Category type and the category type */
export type CategoryToParentCategoryConnectionEdge = CategoryConnectionEdge &
  Edge &
  OneToOneConnection & {
    __typename?: "CategoryToParentCategoryConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: Category;
  };

/** Connection between the Category type and the post type */
export type CategoryToPostConnection = Connection &
  PostConnection & {
    __typename?: "CategoryToPostConnection";
    /** Edges for the CategoryToPostConnection connection */
    edges: Array<CategoryToPostConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Post>;
    /** Information about pagination in a connection. */
    pageInfo: CategoryToPostConnectionPageInfo;
  };

/** An edge in a connection */
export type CategoryToPostConnectionEdge = Edge &
  PostConnectionEdge & {
    __typename?: "CategoryToPostConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Post;
  };

/** Page Info on the &quot;CategoryToPostConnection&quot; */
export type CategoryToPostConnectionPageInfo = PageInfo &
  PostConnectionPageInfo &
  WpPageInfo & {
    __typename?: "CategoryToPostConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the CategoryToPostConnection connection */
export type CategoryToPostConnectionWhereArgs = {
  /** The user that's connected as the author of the object. Use the userId for the author object. */
  author?: InputMaybe<Scalars["Int"]["input"]>;
  /** Find objects connected to author(s) in the array of author's userIds */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Find objects connected to the author by the author's nicename */
  authorName?: InputMaybe<Scalars["String"]["input"]>;
  /** Find objects NOT connected to author(s) in the array of author's userIds */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Category ID */
  categoryId?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of category IDs, used to display objects from one category OR another */
  categoryIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Use Category Slug */
  categoryName?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of category IDs, used to display objects from one category OR another */
  categoryNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Tag Slug */
  tag?: InputMaybe<Scalars["String"]["input"]>;
  /** Use Tag ID */
  tagId?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of tag IDs, used to display objects from one tag OR another */
  tagIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of tag IDs, used to display objects from one tag OR another */
  tagNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of tag slugs, used to display objects from one tag AND another */
  tagSlugAnd?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Array of tag slugs, used to include objects in ANY specified tags */
  tagSlugIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the Category type and the Taxonomy type */
export type CategoryToTaxonomyConnectionEdge = Edge &
  OneToOneConnection &
  TaxonomyConnectionEdge & {
    __typename?: "CategoryToTaxonomyConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: Taxonomy;
  };

/** A Comment object */
export type Comment = DatabaseIdentifier &
  Node & {
    __typename?: "Comment";
    /** User agent used to post the comment. This field is equivalent to WP_Comment-&gt;comment_agent and the value matching the &quot;comment_agent&quot; column in SQL. */
    agent?: Maybe<Scalars["String"]["output"]>;
    /**
     * The approval status of the comment. This field is equivalent to WP_Comment-&gt;comment_approved and the value matching the &quot;comment_approved&quot; column in SQL.
     * @deprecated Deprecated in favor of the `status` field
     */
    approved?: Maybe<Scalars["Boolean"]["output"]>;
    /** The author of the comment */
    author?: Maybe<CommentToCommenterConnectionEdge>;
    /** IP address for the author. This field is equivalent to WP_Comment-&gt;comment_author_IP and the value matching the &quot;comment_author_IP&quot; column in SQL. */
    authorIp?: Maybe<Scalars["String"]["output"]>;
    /**
     * ID for the comment, unique among comments.
     * @deprecated Deprecated in favor of databaseId
     */
    commentId?: Maybe<Scalars["Int"]["output"]>;
    /** Connection between the Comment type and the ContentNode type */
    commentedOn?: Maybe<CommentToContentNodeConnectionEdge>;
    /** Content of the comment. This field is equivalent to WP_Comment-&gt;comment_content and the value matching the &quot;comment_content&quot; column in SQL. */
    content?: Maybe<Scalars["String"]["output"]>;
    /** The unique identifier stored in the database */
    databaseId: Scalars["Int"]["output"];
    /** Date the comment was posted in local time. This field is equivalent to WP_Comment-&gt;date and the value matching the &quot;date&quot; column in SQL. */
    date?: Maybe<Scalars["String"]["output"]>;
    /** Date the comment was posted in GMT. This field is equivalent to WP_Comment-&gt;date_gmt and the value matching the &quot;date_gmt&quot; column in SQL. */
    dateGmt?: Maybe<Scalars["String"]["output"]>;
    /** The globally unique identifier for the comment object */
    id: Scalars["ID"]["output"];
    /** Whether the object is restricted from the current viewer */
    isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
    /** Karma value for the comment. This field is equivalent to WP_Comment-&gt;comment_karma and the value matching the &quot;comment_karma&quot; column in SQL. */
    karma?: Maybe<Scalars["Int"]["output"]>;
    /** Connection between the Comment type and the Comment type */
    parent?: Maybe<CommentToParentCommentConnectionEdge>;
    /** The database id of the parent comment node or null if it is the root comment */
    parentDatabaseId?: Maybe<Scalars["Int"]["output"]>;
    /** The globally unique identifier of the parent comment node. */
    parentId?: Maybe<Scalars["ID"]["output"]>;
    /** Connection between the Comment type and the Comment type */
    replies?: Maybe<CommentToCommentConnection>;
    /** The approval status of the comment. This field is equivalent to WP_Comment-&gt;comment_approved and the value matching the &quot;comment_approved&quot; column in SQL. */
    status?: Maybe<CommentStatusEnum>;
    /** Type of comment. This field is equivalent to WP_Comment-&gt;comment_type and the value matching the &quot;comment_type&quot; column in SQL. */
    type?: Maybe<Scalars["String"]["output"]>;
  };

/** A Comment object */
export type CommentContentArgs = {
  format?: InputMaybe<PostObjectFieldFormatEnum>;
};

/** A Comment object */
export type CommentParentArgs = {
  where?: InputMaybe<CommentToParentCommentConnectionWhereArgs>;
};

/** A Comment object */
export type CommentRepliesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<CommentToCommentConnectionWhereArgs>;
};

/** A Comment Author object */
export type CommentAuthor = Commenter &
  DatabaseIdentifier &
  Node & {
    __typename?: "CommentAuthor";
    /** Avatar object for user. The avatar object can be retrieved in different sizes by specifying the size argument. */
    avatar?: Maybe<Avatar>;
    /** The unique identifier stored in the database */
    databaseId: Scalars["Int"]["output"];
    /** The email for the comment author */
    email?: Maybe<Scalars["String"]["output"]>;
    /** The globally unique identifier for the comment author object */
    id: Scalars["ID"]["output"];
    /** Whether the object is restricted from the current viewer */
    isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
    /** The name for the comment author. */
    name?: Maybe<Scalars["String"]["output"]>;
    /** The url the comment author. */
    url?: Maybe<Scalars["String"]["output"]>;
  };

/** A Comment Author object */
export type CommentAuthorAvatarArgs = {
  forceDefault?: InputMaybe<Scalars["Boolean"]["input"]>;
  rating?: InputMaybe<AvatarRatingEnum>;
  size?: InputMaybe<Scalars["Int"]["input"]>;
};

/** Connection to Comment Nodes */
export type CommentConnection = {
  /** A list of edges (relational context) between RootQuery and connected Comment Nodes */
  edges: Array<CommentConnectionEdge>;
  /** A list of connected Comment Nodes */
  nodes: Array<Comment>;
  /** Information about pagination in a connection. */
  pageInfo: CommentConnectionPageInfo;
};

/** Edge between a Node and a connected Comment */
export type CommentConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected Comment Node */
  node: Comment;
};

/** Page Info on the connected CommentConnectionEdge */
export type CommentConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** The Type of Identifier used to fetch a single comment node. Default is "ID". To be used along with the "id" field. */
export enum CommentNodeIdTypeEnum {
  /** Identify a resource by the Database ID. */
  DatabaseId = "DATABASE_ID",
  /** Identify a resource by the (hashed) Global ID. */
  Id = "ID",
}

/** The status of the comment object. */
export enum CommentStatusEnum {
  /** Comments with the Approved status */
  Approve = "APPROVE",
  /** Comments with the Unapproved status */
  Hold = "HOLD",
  /** Comments with the Spam status */
  Spam = "SPAM",
  /** Comments with the Trash status */
  Trash = "TRASH",
}

/** Connection between the Comment type and the Comment type */
export type CommentToCommentConnection = CommentConnection &
  Connection & {
    __typename?: "CommentToCommentConnection";
    /** Edges for the CommentToCommentConnection connection */
    edges: Array<CommentToCommentConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Comment>;
    /** Information about pagination in a connection. */
    pageInfo: CommentToCommentConnectionPageInfo;
  };

/** An edge in a connection */
export type CommentToCommentConnectionEdge = CommentConnectionEdge &
  Edge & {
    __typename?: "CommentToCommentConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Comment;
  };

/** Page Info on the &quot;CommentToCommentConnection&quot; */
export type CommentToCommentConnectionPageInfo = CommentConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "CommentToCommentConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the CommentToCommentConnection connection */
export type CommentToCommentConnectionWhereArgs = {
  /** Comment author email address. */
  authorEmail?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of author IDs to include comments for. */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to exclude comments for. */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Comment author URL. */
  authorUrl?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of comment IDs to include. */
  commentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of IDs of users whose unapproved comments will be returned by the query regardless of status. */
  commentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Include comments of a given type. */
  commentType?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments from a given array of comment types. */
  commentTypeIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Exclude comments from a given array of comment types. */
  commentTypeNotIn?: InputMaybe<Scalars["String"]["input"]>;
  /** Content object author ID to limit results by. */
  contentAuthor?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to retrieve comments for. */
  contentAuthorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs *not* to retrieve comments for. */
  contentAuthorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Limit results to those affiliated with a given content object ID. */
  contentId?: InputMaybe<Scalars["ID"]["input"]>;
  /** Array of content object IDs to include affiliated comments for. */
  contentIdIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of content object IDs to exclude affiliated comments for. */
  contentIdNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Content object name (i.e. slug ) to retrieve affiliated comments for. */
  contentName?: InputMaybe<Scalars["String"]["input"]>;
  /** Content Object parent ID to retrieve affiliated comments for. */
  contentParent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of content object statuses to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentStatus?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Content object type or array of types to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentType?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Array of IDs or email addresses of users whose unapproved comments will be returned by the query regardless of $status. Default empty */
  includeUnapproved?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Karma score to retrieve matching comments for. */
  karma?: InputMaybe<Scalars["Int"]["input"]>;
  /** The cardinality of the order of the connection */
  order?: InputMaybe<OrderEnum>;
  /** Field to order the comments by. */
  orderby?: InputMaybe<CommentsConnectionOrderbyEnum>;
  /** Parent ID of comment to retrieve children of. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of parent IDs of comments to retrieve children for. */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of parent IDs of comments *not* to retrieve children for. */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Search term(s) to retrieve matching comments for. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Comment status to limit results by. */
  status?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments for a specific user ID. */
  userId?: InputMaybe<Scalars["ID"]["input"]>;
};

/** Connection between the Comment type and the Commenter type */
export type CommentToCommenterConnectionEdge = CommenterConnectionEdge &
  Edge &
  OneToOneConnection & {
    __typename?: "CommentToCommenterConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: Commenter;
  };

/** Connection between the Comment type and the ContentNode type */
export type CommentToContentNodeConnectionEdge = ContentNodeConnectionEdge &
  Edge &
  OneToOneConnection & {
    __typename?: "CommentToContentNodeConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: ContentNode;
  };

/** Connection between the Comment type and the Comment type */
export type CommentToParentCommentConnectionEdge = CommentConnectionEdge &
  Edge &
  OneToOneConnection & {
    __typename?: "CommentToParentCommentConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: Comment;
  };

/** Arguments for filtering the CommentToParentCommentConnection connection */
export type CommentToParentCommentConnectionWhereArgs = {
  /** Comment author email address. */
  authorEmail?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of author IDs to include comments for. */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to exclude comments for. */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Comment author URL. */
  authorUrl?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of comment IDs to include. */
  commentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of IDs of users whose unapproved comments will be returned by the query regardless of status. */
  commentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Include comments of a given type. */
  commentType?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments from a given array of comment types. */
  commentTypeIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Exclude comments from a given array of comment types. */
  commentTypeNotIn?: InputMaybe<Scalars["String"]["input"]>;
  /** Content object author ID to limit results by. */
  contentAuthor?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to retrieve comments for. */
  contentAuthorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs *not* to retrieve comments for. */
  contentAuthorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Limit results to those affiliated with a given content object ID. */
  contentId?: InputMaybe<Scalars["ID"]["input"]>;
  /** Array of content object IDs to include affiliated comments for. */
  contentIdIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of content object IDs to exclude affiliated comments for. */
  contentIdNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Content object name (i.e. slug ) to retrieve affiliated comments for. */
  contentName?: InputMaybe<Scalars["String"]["input"]>;
  /** Content Object parent ID to retrieve affiliated comments for. */
  contentParent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of content object statuses to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentStatus?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Content object type or array of types to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentType?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Array of IDs or email addresses of users whose unapproved comments will be returned by the query regardless of $status. Default empty */
  includeUnapproved?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Karma score to retrieve matching comments for. */
  karma?: InputMaybe<Scalars["Int"]["input"]>;
  /** The cardinality of the order of the connection */
  order?: InputMaybe<OrderEnum>;
  /** Field to order the comments by. */
  orderby?: InputMaybe<CommentsConnectionOrderbyEnum>;
  /** Parent ID of comment to retrieve children of. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of parent IDs of comments to retrieve children for. */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of parent IDs of comments *not* to retrieve children for. */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Search term(s) to retrieve matching comments for. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Comment status to limit results by. */
  status?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments for a specific user ID. */
  userId?: InputMaybe<Scalars["ID"]["input"]>;
};

/** The author of a comment */
export type Commenter = {
  /** Avatar object for user. The avatar object can be retrieved in different sizes by specifying the size argument. */
  avatar?: Maybe<Avatar>;
  /** Identifies the primary key from the database. */
  databaseId: Scalars["Int"]["output"];
  /** The email address of the author of a comment. */
  email?: Maybe<Scalars["String"]["output"]>;
  /** The globally unique identifier for the comment author. */
  id: Scalars["ID"]["output"];
  /** Whether the author information is considered restricted. (not fully public) */
  isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
  /** The name of the author of a comment. */
  name?: Maybe<Scalars["String"]["output"]>;
  /** The url of the author of a comment. */
  url?: Maybe<Scalars["String"]["output"]>;
};

/** Edge between a Node and a connected Commenter */
export type CommenterConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected Commenter Node */
  node: Commenter;
};

/** Options for ordering the connection */
export enum CommentsConnectionOrderbyEnum {
  /** Order by browser user agent of the commenter. */
  CommentAgent = "COMMENT_AGENT",
  /** Order by approval status of the comment. */
  CommentApproved = "COMMENT_APPROVED",
  /** Order by name of the comment author. */
  CommentAuthor = "COMMENT_AUTHOR",
  /** Order by e-mail of the comment author. */
  CommentAuthorEmail = "COMMENT_AUTHOR_EMAIL",
  /** Order by IP address of the comment author. */
  CommentAuthorIp = "COMMENT_AUTHOR_IP",
  /** Order by URL address of the comment author. */
  CommentAuthorUrl = "COMMENT_AUTHOR_URL",
  /** Order by the comment contents. */
  CommentContent = "COMMENT_CONTENT",
  /** Order by date/time timestamp of the comment. */
  CommentDate = "COMMENT_DATE",
  /** Order by GMT timezone date/time timestamp of the comment. */
  CommentDateGmt = "COMMENT_DATE_GMT",
  /** Order by the globally unique identifier for the comment object */
  CommentId = "COMMENT_ID",
  /** Order by the array list of comment IDs listed in the where clause. */
  CommentIn = "COMMENT_IN",
  /** Order by the comment karma score. */
  CommentKarma = "COMMENT_KARMA",
  /** Order by the comment parent ID. */
  CommentParent = "COMMENT_PARENT",
  /** Order by the post object ID. */
  CommentPostId = "COMMENT_POST_ID",
  /** Order by the the type of comment, such as 'comment', 'pingback', or 'trackback'. */
  CommentType = "COMMENT_TYPE",
  /** Order by the user ID. */
  UserId = "USER_ID",
}

/** A plural connection from one Node Type in the Graph to another Node Type, with support for relational data via &quot;edges&quot;. */
export type Connection = {
  /** A list of edges (relational context) between connected nodes */
  edges: Array<Edge>;
  /** A list of connected nodes */
  nodes: Array<Node>;
  /** Information about pagination in a connection. */
  pageInfo: PageInfo;
};

/** Nodes used to manage content */
export type ContentNode = {
  /** Connection between the ContentNode type and the ContentType type */
  contentType?: Maybe<ContentNodeToContentTypeConnectionEdge>;
  /** The name of the Content Type the node belongs to */
  contentTypeName: Scalars["String"]["output"];
  /** The ID of the node in the database. */
  databaseId: Scalars["Int"]["output"];
  /** Post publishing date. */
  date?: Maybe<Scalars["String"]["output"]>;
  /** The publishing date set in GMT. */
  dateGmt?: Maybe<Scalars["String"]["output"]>;
  /** The desired slug of the post */
  desiredSlug?: Maybe<Scalars["String"]["output"]>;
  /** If a user has edited the node within the past 15 seconds, this will return the user that last edited. Null if the edit lock doesn&#039;t exist or is greater than 15 seconds */
  editingLockedBy?: Maybe<ContentNodeToEditLockConnectionEdge>;
  /** The RSS enclosure for the object */
  enclosure?: Maybe<Scalars["String"]["output"]>;
  /** Connection between the ContentNode type and the EnqueuedScript type */
  enqueuedScripts?: Maybe<ContentNodeToEnqueuedScriptConnection>;
  /** Connection between the ContentNode type and the EnqueuedStylesheet type */
  enqueuedStylesheets?: Maybe<ContentNodeToEnqueuedStylesheetConnection>;
  /** The global unique identifier for this post. This currently matches the value stored in WP_Post-&gt;guid and the guid column in the &quot;post_objects&quot; database table. */
  guid?: Maybe<Scalars["String"]["output"]>;
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
  /** Whether the node is a Content Node */
  isContentNode: Scalars["Boolean"]["output"];
  /** Whether the object is a node in the preview state */
  isPreview?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether the object is restricted from the current viewer */
  isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether the node is a Term */
  isTermNode: Scalars["Boolean"]["output"];
  /** The user that most recently edited the node */
  lastEditedBy?: Maybe<ContentNodeToEditLastConnectionEdge>;
  /** The permalink of the post */
  link?: Maybe<Scalars["String"]["output"]>;
  /** The local modified time for a post. If a post was recently updated the modified field will change to match the corresponding time. */
  modified?: Maybe<Scalars["String"]["output"]>;
  /** The GMT modified time for a post. If a post was recently updated the modified field will change to match the corresponding time in GMT. */
  modifiedGmt?: Maybe<Scalars["String"]["output"]>;
  /** The database id of the preview node */
  previewRevisionDatabaseId?: Maybe<Scalars["Int"]["output"]>;
  /** Whether the object is a node in the preview state */
  previewRevisionId?: Maybe<Scalars["ID"]["output"]>;
  /** The Yoast SEO data of the ContentNode */
  seo?: Maybe<PostTypeSeo>;
  /** The uri slug for the post. This is equivalent to the WP_Post-&gt;post_name field and the post_name column in the database for the &quot;post_objects&quot; table. */
  slug?: Maybe<Scalars["String"]["output"]>;
  /** The current status of the object */
  status?: Maybe<Scalars["String"]["output"]>;
  /** The template assigned to a node of content */
  template?: Maybe<ContentTemplate>;
  /** The unique resource identifier path */
  uri?: Maybe<Scalars["String"]["output"]>;
};

/** Nodes used to manage content */
export type ContentNodeEnqueuedScriptsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** Nodes used to manage content */
export type ContentNodeEnqueuedStylesheetsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** Connection to ContentNode Nodes */
export type ContentNodeConnection = {
  /** A list of edges (relational context) between ContentType and connected ContentNode Nodes */
  edges: Array<ContentNodeConnectionEdge>;
  /** A list of connected ContentNode Nodes */
  nodes: Array<ContentNode>;
  /** Information about pagination in a connection. */
  pageInfo: ContentNodeConnectionPageInfo;
};

/** Edge between a Node and a connected ContentNode */
export type ContentNodeConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected ContentNode Node */
  node: ContentNode;
};

/** Page Info on the connected ContentNodeConnectionEdge */
export type ContentNodeConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** The Type of Identifier used to fetch a single resource. Default is ID. */
export enum ContentNodeIdTypeEnum {
  /** Identify a resource by the Database ID. */
  DatabaseId = "DATABASE_ID",
  /** Identify a resource by the (hashed) Global ID. */
  Id = "ID",
  /** Identify a resource by the URI. */
  Uri = "URI",
}

/** Connection between the ContentNode type and the ContentType type */
export type ContentNodeToContentTypeConnectionEdge = ContentTypeConnectionEdge &
  Edge &
  OneToOneConnection & {
    __typename?: "ContentNodeToContentTypeConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: ContentType;
  };

/** Connection between the ContentNode type and the User type */
export type ContentNodeToEditLastConnectionEdge = Edge &
  OneToOneConnection &
  UserConnectionEdge & {
    __typename?: "ContentNodeToEditLastConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: User;
  };

/** Connection between the ContentNode type and the User type */
export type ContentNodeToEditLockConnectionEdge = Edge &
  OneToOneConnection &
  UserConnectionEdge & {
    __typename?: "ContentNodeToEditLockConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The timestamp for when the node was last edited */
    lockTimestamp?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: User;
  };

/** Connection between the ContentNode type and the EnqueuedScript type */
export type ContentNodeToEnqueuedScriptConnection = Connection &
  EnqueuedScriptConnection & {
    __typename?: "ContentNodeToEnqueuedScriptConnection";
    /** Edges for the ContentNodeToEnqueuedScriptConnection connection */
    edges: Array<ContentNodeToEnqueuedScriptConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<EnqueuedScript>;
    /** Information about pagination in a connection. */
    pageInfo: ContentNodeToEnqueuedScriptConnectionPageInfo;
  };

/** An edge in a connection */
export type ContentNodeToEnqueuedScriptConnectionEdge = Edge &
  EnqueuedScriptConnectionEdge & {
    __typename?: "ContentNodeToEnqueuedScriptConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: EnqueuedScript;
  };

/** Page Info on the &quot;ContentNodeToEnqueuedScriptConnection&quot; */
export type ContentNodeToEnqueuedScriptConnectionPageInfo =
  EnqueuedScriptConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "ContentNodeToEnqueuedScriptConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Connection between the ContentNode type and the EnqueuedStylesheet type */
export type ContentNodeToEnqueuedStylesheetConnection = Connection &
  EnqueuedStylesheetConnection & {
    __typename?: "ContentNodeToEnqueuedStylesheetConnection";
    /** Edges for the ContentNodeToEnqueuedStylesheetConnection connection */
    edges: Array<ContentNodeToEnqueuedStylesheetConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<EnqueuedStylesheet>;
    /** Information about pagination in a connection. */
    pageInfo: ContentNodeToEnqueuedStylesheetConnectionPageInfo;
  };

/** An edge in a connection */
export type ContentNodeToEnqueuedStylesheetConnectionEdge = Edge &
  EnqueuedStylesheetConnectionEdge & {
    __typename?: "ContentNodeToEnqueuedStylesheetConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: EnqueuedStylesheet;
  };

/** Page Info on the &quot;ContentNodeToEnqueuedStylesheetConnection&quot; */
export type ContentNodeToEnqueuedStylesheetConnectionPageInfo =
  EnqueuedStylesheetConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "ContentNodeToEnqueuedStylesheetConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** The template assigned to a node of content */
export type ContentTemplate = {
  /** The name of the template */
  templateName?: Maybe<Scalars["String"]["output"]>;
};

/** An Post Type object */
export type ContentType = Node &
  UniformResourceIdentifiable & {
    __typename?: "ContentType";
    /** Whether this content type should can be exported. */
    canExport?: Maybe<Scalars["Boolean"]["output"]>;
    /** Connection between the ContentType type and the Taxonomy type */
    connectedTaxonomies?: Maybe<ContentTypeToTaxonomyConnection>;
    /** Connection between the ContentType type and the ContentNode type */
    contentNodes?: Maybe<ContentTypeToContentNodeConnection>;
    /** Whether content of this type should be deleted when the author of it is deleted from the system. */
    deleteWithUser?: Maybe<Scalars["Boolean"]["output"]>;
    /** Description of the content type. */
    description?: Maybe<Scalars["String"]["output"]>;
    /** Whether to exclude nodes of this content type from front end search results. */
    excludeFromSearch?: Maybe<Scalars["Boolean"]["output"]>;
    /** The plural name of the content type within the GraphQL Schema. */
    graphqlPluralName?: Maybe<Scalars["String"]["output"]>;
    /** The singular name of the content type within the GraphQL Schema. */
    graphqlSingleName?: Maybe<Scalars["String"]["output"]>;
    /** Whether this content type should have archives. Content archives are generated by type and by date. */
    hasArchive?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether the content type is hierarchical, for example pages. */
    hierarchical?: Maybe<Scalars["Boolean"]["output"]>;
    /** The globally unique identifier of the post-type object. */
    id: Scalars["ID"]["output"];
    /** Whether the node is a Content Node */
    isContentNode: Scalars["Boolean"]["output"];
    /** Whether this page is set to the static front page. */
    isFrontPage: Scalars["Boolean"]["output"];
    /** Whether this page is set to the blog posts page. */
    isPostsPage: Scalars["Boolean"]["output"];
    /** Whether the object is restricted from the current viewer */
    isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether the node is a Term */
    isTermNode: Scalars["Boolean"]["output"];
    /** Display name of the content type. */
    label?: Maybe<Scalars["String"]["output"]>;
    /** Details about the content type labels. */
    labels?: Maybe<PostTypeLabelDetails>;
    /** The name of the icon file to display as a menu icon. */
    menuIcon?: Maybe<Scalars["String"]["output"]>;
    /** The position of this post type in the menu. Only applies if show_in_menu is true. */
    menuPosition?: Maybe<Scalars["Int"]["output"]>;
    /** The internal name of the post type. This should not be used for display purposes. */
    name?: Maybe<Scalars["String"]["output"]>;
    /** Whether a content type is intended for use publicly either via the admin interface or by front-end users. While the default settings of exclude_from_search, publicly_queryable, show_ui, and show_in_nav_menus are inherited from public, each does not rely on this relationship and controls a very specific intention. */
    public?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether queries can be performed on the front end for the content type as part of parse_request(). */
    publiclyQueryable?: Maybe<Scalars["Boolean"]["output"]>;
    /** Name of content type to display in REST API &quot;wp/v2&quot; namespace. */
    restBase?: Maybe<Scalars["String"]["output"]>;
    /** The REST Controller class assigned to handling this content type. */
    restControllerClass?: Maybe<Scalars["String"]["output"]>;
    /** Makes this content type available via the admin bar. */
    showInAdminBar?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether to add the content type to the GraphQL Schema. */
    showInGraphql?: Maybe<Scalars["Boolean"]["output"]>;
    /** Where to show the content type in the admin menu. To work, $show_ui must be true. If true, the post type is shown in its own top level menu. If false, no menu is shown. If a string of an existing top level menu (eg. &quot;tools.php&quot; or &quot;edit.php?post_type=page&quot;), the post type will be placed as a sub-menu of that. */
    showInMenu?: Maybe<Scalars["Boolean"]["output"]>;
    /** Makes this content type available for selection in navigation menus. */
    showInNavMenus?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether the content type is associated with a route under the the REST API &quot;wp/v2&quot; namespace. */
    showInRest?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether to generate and allow a UI for managing this content type in the admin. */
    showUi?: Maybe<Scalars["Boolean"]["output"]>;
    /** The unique resource identifier path */
    uri?: Maybe<Scalars["String"]["output"]>;
  };

/** An Post Type object */
export type ContentTypeConnectedTaxonomiesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** An Post Type object */
export type ContentTypeContentNodesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<ContentTypeToContentNodeConnectionWhereArgs>;
};

/** Connection to ContentType Nodes */
export type ContentTypeConnection = {
  /** A list of edges (relational context) between RootQuery and connected ContentType Nodes */
  edges: Array<ContentTypeConnectionEdge>;
  /** A list of connected ContentType Nodes */
  nodes: Array<ContentType>;
  /** Information about pagination in a connection. */
  pageInfo: ContentTypeConnectionPageInfo;
};

/** Edge between a Node and a connected ContentType */
export type ContentTypeConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected ContentType Node */
  node: ContentType;
};

/** Page Info on the connected ContentTypeConnectionEdge */
export type ContentTypeConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** Allowed Content Types */
export enum ContentTypeEnum {
  /** The Type of Content object */
  Attachment = "ATTACHMENT",
  /** The Type of Content object */
  Page = "PAGE",
  /** The Type of Content object */
  Post = "POST",
}

/** The Type of Identifier used to fetch a single Content Type node. To be used along with the "id" field. Default is "ID". */
export enum ContentTypeIdTypeEnum {
  /** The globally unique ID */
  Id = "ID",
  /** The name of the content type. */
  Name = "NAME",
}

/** Connection between the ContentType type and the ContentNode type */
export type ContentTypeToContentNodeConnection = Connection &
  ContentNodeConnection & {
    __typename?: "ContentTypeToContentNodeConnection";
    /** Edges for the ContentTypeToContentNodeConnection connection */
    edges: Array<ContentTypeToContentNodeConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<ContentNode>;
    /** Information about pagination in a connection. */
    pageInfo: ContentTypeToContentNodeConnectionPageInfo;
  };

/** An edge in a connection */
export type ContentTypeToContentNodeConnectionEdge = ContentNodeConnectionEdge &
  Edge & {
    __typename?: "ContentTypeToContentNodeConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: ContentNode;
  };

/** Page Info on the &quot;ContentTypeToContentNodeConnection&quot; */
export type ContentTypeToContentNodeConnectionPageInfo =
  ContentNodeConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "ContentTypeToContentNodeConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Arguments for filtering the ContentTypeToContentNodeConnection connection */
export type ContentTypeToContentNodeConnectionWhereArgs = {
  /** The Types of content to filter */
  contentTypes?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the ContentType type and the Taxonomy type */
export type ContentTypeToTaxonomyConnection = Connection &
  TaxonomyConnection & {
    __typename?: "ContentTypeToTaxonomyConnection";
    /** Edges for the ContentTypeToTaxonomyConnection connection */
    edges: Array<ContentTypeToTaxonomyConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Taxonomy>;
    /** Information about pagination in a connection. */
    pageInfo: ContentTypeToTaxonomyConnectionPageInfo;
  };

/** An edge in a connection */
export type ContentTypeToTaxonomyConnectionEdge = Edge &
  TaxonomyConnectionEdge & {
    __typename?: "ContentTypeToTaxonomyConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Taxonomy;
  };

/** Page Info on the &quot;ContentTypeToTaxonomyConnection&quot; */
export type ContentTypeToTaxonomyConnectionPageInfo = PageInfo &
  TaxonomyConnectionPageInfo &
  WpPageInfo & {
    __typename?: "ContentTypeToTaxonomyConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Allowed Content Types of the Category taxonomy. */
export enum ContentTypesOfCategoryEnum {
  /** The Type of Content object */
  Post = "POST",
}

/** Allowed Content Types of the PostFormat taxonomy. */
export enum ContentTypesOfPostFormatEnum {
  /** The Type of Content object */
  Post = "POST",
}

/** Allowed Content Types of the Tag taxonomy. */
export enum ContentTypesOfTagEnum {
  /** The Type of Content object */
  Post = "POST",
}

/** Input for the createCategory mutation. */
export type CreateCategoryInput = {
  /** The slug that the category will be an alias of */
  aliasOf?: InputMaybe<Scalars["String"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The description of the category object */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** The name of the category object to mutate */
  name: Scalars["String"]["input"];
  /** The ID of the category that should be set as the parent */
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  /** If this argument exists then the slug will be checked to see if it is not an existing valid term. If that check succeeds (it is not a valid term), then it is added and the term id is given. If it fails, then a check is made to whether the taxonomy is hierarchical and the parent argument is not empty. If the second check succeeds, the term will be inserted and the term id will be given. If the slug argument is empty, then it will be calculated from the term name. */
  slug?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the createCategory mutation. */
export type CreateCategoryPayload = {
  __typename?: "CreateCategoryPayload";
  /** The created category */
  category?: Maybe<Category>;
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
};

/** Input for the createComment mutation. */
export type CreateCommentInput = {
  /** The approval status of the comment. */
  approved?: InputMaybe<Scalars["String"]["input"]>;
  /** The name of the comment's author. */
  author?: InputMaybe<Scalars["String"]["input"]>;
  /** The email of the comment's author. */
  authorEmail?: InputMaybe<Scalars["String"]["input"]>;
  /** The url of the comment's author. */
  authorUrl?: InputMaybe<Scalars["String"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The database ID of the post object the comment belongs to. */
  commentOn?: InputMaybe<Scalars["Int"]["input"]>;
  /** Content of the comment. */
  content?: InputMaybe<Scalars["String"]["input"]>;
  /** The date of the object. Preferable to enter as year/month/day ( e.g. 01/31/2017 ) as it will rearrange date as fit if it is not specified. Incomplete dates may have unintended results for example, "2017" as the input will use current date with timestamp 20:17  */
  date?: InputMaybe<Scalars["String"]["input"]>;
  /** Parent comment ID of current comment. */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** The approval status of the comment */
  status?: InputMaybe<CommentStatusEnum>;
  /** Type of comment. */
  type?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the createComment mutation. */
export type CreateCommentPayload = {
  __typename?: "CreateCommentPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The comment that was created */
  comment?: Maybe<Comment>;
  /** Whether the mutation succeeded. If the comment is not approved, the server will not return the comment to a non authenticated user, but a success message can be returned if the create succeeded, and the client can optimistically add the comment to the client cache */
  success?: Maybe<Scalars["Boolean"]["output"]>;
};

/** Input for the createMediaItem mutation. */
export type CreateMediaItemInput = {
  /** Alternative text to display when mediaItem is not displayed */
  altText?: InputMaybe<Scalars["String"]["input"]>;
  /** The userId to assign as the author of the mediaItem */
  authorId?: InputMaybe<Scalars["ID"]["input"]>;
  /** The caption for the mediaItem */
  caption?: InputMaybe<Scalars["String"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The comment status for the mediaItem */
  commentStatus?: InputMaybe<Scalars["String"]["input"]>;
  /** The date of the mediaItem */
  date?: InputMaybe<Scalars["String"]["input"]>;
  /** The date (in GMT zone) of the mediaItem */
  dateGmt?: InputMaybe<Scalars["String"]["input"]>;
  /** Description of the mediaItem */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** The file name of the mediaItem */
  filePath?: InputMaybe<Scalars["String"]["input"]>;
  /** The file type of the mediaItem */
  fileType?: InputMaybe<MimeTypeEnum>;
  /** The ID of the parent object */
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  /** The ping status for the mediaItem */
  pingStatus?: InputMaybe<Scalars["String"]["input"]>;
  /** The slug of the mediaItem */
  slug?: InputMaybe<Scalars["String"]["input"]>;
  /** The status of the mediaItem */
  status?: InputMaybe<MediaItemStatusEnum>;
  /** The title of the mediaItem */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the createMediaItem mutation. */
export type CreateMediaItemPayload = {
  __typename?: "CreateMediaItemPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The MediaItem object mutation type. */
  mediaItem?: Maybe<MediaItem>;
};

/** Input for the createPage mutation. */
export type CreatePageInput = {
  /** The userId to assign as the author of the object */
  authorId?: InputMaybe<Scalars["ID"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The comment status for the object */
  commentStatus?: InputMaybe<Scalars["String"]["input"]>;
  /** The content of the object */
  content?: InputMaybe<Scalars["String"]["input"]>;
  /** The date of the object. Preferable to enter as year/month/day (e.g. 01/31/2017) as it will rearrange date as fit if it is not specified. Incomplete dates may have unintended results for example, "2017" as the input will use current date with timestamp 20:17  */
  date?: InputMaybe<Scalars["String"]["input"]>;
  /** A field used for ordering posts. This is typically used with nav menu items or for special ordering of hierarchical content types. */
  menuOrder?: InputMaybe<Scalars["Int"]["input"]>;
  /** The ID of the parent object */
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  /** The password used to protect the content of the object */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** The slug of the object */
  slug?: InputMaybe<Scalars["String"]["input"]>;
  /** The status of the object */
  status?: InputMaybe<PostStatusEnum>;
  /** The title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the createPage mutation. */
export type CreatePagePayload = {
  __typename?: "CreatePagePayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The Post object mutation type. */
  page?: Maybe<Page>;
};

/** Input for the createPostFormat mutation. */
export type CreatePostFormatInput = {
  /** The slug that the post_format will be an alias of */
  aliasOf?: InputMaybe<Scalars["String"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The description of the post_format object */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** The name of the post_format object to mutate */
  name: Scalars["String"]["input"];
  /** If this argument exists then the slug will be checked to see if it is not an existing valid term. If that check succeeds (it is not a valid term), then it is added and the term id is given. If it fails, then a check is made to whether the taxonomy is hierarchical and the parent argument is not empty. If the second check succeeds, the term will be inserted and the term id will be given. If the slug argument is empty, then it will be calculated from the term name. */
  slug?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the createPostFormat mutation. */
export type CreatePostFormatPayload = {
  __typename?: "CreatePostFormatPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The created post_format */
  postFormat?: Maybe<PostFormat>;
};

/** Input for the createPost mutation. */
export type CreatePostInput = {
  /** The userId to assign as the author of the object */
  authorId?: InputMaybe<Scalars["ID"]["input"]>;
  /** Set connections between the post and categories */
  categories?: InputMaybe<PostCategoriesInput>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The comment status for the object */
  commentStatus?: InputMaybe<Scalars["String"]["input"]>;
  /** The content of the object */
  content?: InputMaybe<Scalars["String"]["input"]>;
  /** The date of the object. Preferable to enter as year/month/day (e.g. 01/31/2017) as it will rearrange date as fit if it is not specified. Incomplete dates may have unintended results for example, "2017" as the input will use current date with timestamp 20:17  */
  date?: InputMaybe<Scalars["String"]["input"]>;
  /** The excerpt of the object */
  excerpt?: InputMaybe<Scalars["String"]["input"]>;
  /** A field used for ordering posts. This is typically used with nav menu items or for special ordering of hierarchical content types. */
  menuOrder?: InputMaybe<Scalars["Int"]["input"]>;
  /** The password used to protect the content of the object */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** The ping status for the object */
  pingStatus?: InputMaybe<Scalars["String"]["input"]>;
  /** URLs that have been pinged. */
  pinged?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Set connections between the post and postFormats */
  postFormats?: InputMaybe<PostPostFormatsInput>;
  /** The slug of the object */
  slug?: InputMaybe<Scalars["String"]["input"]>;
  /** The status of the object */
  status?: InputMaybe<PostStatusEnum>;
  /** Set connections between the post and tags */
  tags?: InputMaybe<PostTagsInput>;
  /** The title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
  /** URLs queued to be pinged. */
  toPing?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
};

/** The payload for the createPost mutation. */
export type CreatePostPayload = {
  __typename?: "CreatePostPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The Post object mutation type. */
  post?: Maybe<Post>;
};

/** Input for the createTag mutation. */
export type CreateTagInput = {
  /** The slug that the post_tag will be an alias of */
  aliasOf?: InputMaybe<Scalars["String"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The description of the post_tag object */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** The name of the post_tag object to mutate */
  name: Scalars["String"]["input"];
  /** If this argument exists then the slug will be checked to see if it is not an existing valid term. If that check succeeds (it is not a valid term), then it is added and the term id is given. If it fails, then a check is made to whether the taxonomy is hierarchical and the parent argument is not empty. If the second check succeeds, the term will be inserted and the term id will be given. If the slug argument is empty, then it will be calculated from the term name. */
  slug?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the createTag mutation. */
export type CreateTagPayload = {
  __typename?: "CreateTagPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The created post_tag */
  tag?: Maybe<Tag>;
};

/** Input for the createUser mutation. */
export type CreateUserInput = {
  /** User's AOL IM account. */
  aim?: InputMaybe<Scalars["String"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** A string containing content about the user. */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** A string that will be shown on the site. Defaults to user's username. It is likely that you will want to change this, for both appearance and security through obscurity (that is if you dont use and delete the default admin user). */
  displayName?: InputMaybe<Scalars["String"]["input"]>;
  /** A string containing the user's email address. */
  email?: InputMaybe<Scalars["String"]["input"]>;
  /** 	The user's first name. */
  firstName?: InputMaybe<Scalars["String"]["input"]>;
  /** User's Jabber account. */
  jabber?: InputMaybe<Scalars["String"]["input"]>;
  /** The user's last name. */
  lastName?: InputMaybe<Scalars["String"]["input"]>;
  /** User's locale. */
  locale?: InputMaybe<Scalars["String"]["input"]>;
  /** A string that contains a URL-friendly name for the user. The default is the user's username. */
  nicename?: InputMaybe<Scalars["String"]["input"]>;
  /** The user's nickname, defaults to the user's username. */
  nickname?: InputMaybe<Scalars["String"]["input"]>;
  /** A string that contains the plain text password for the user. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** If true, this will refresh the users JWT secret. */
  refreshJwtUserSecret?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** The date the user registered. Format is Y-m-d H:i:s. */
  registered?: InputMaybe<Scalars["String"]["input"]>;
  /** If true, this will revoke the users JWT secret. If false, this will unrevoke the JWT secret AND issue a new one. To revoke, the user must have proper capabilities to edit users JWT secrets. */
  revokeJwtUserSecret?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** A string for whether to enable the rich editor or not. False if not empty. */
  richEditing?: InputMaybe<Scalars["String"]["input"]>;
  /** An array of roles to be assigned to the user. */
  roles?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** A string that contains the user's username for logging in. */
  username: Scalars["String"]["input"];
  /** A string containing the user's URL for the user's web site. */
  websiteUrl?: InputMaybe<Scalars["String"]["input"]>;
  /** User's Yahoo IM account. */
  yim?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the createUser mutation. */
export type CreateUserPayload = {
  __typename?: "CreateUserPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The User object mutation type. */
  user?: Maybe<User>;
};

/** Object that can be identified with a Database ID */
export type DatabaseIdentifier = {
  /** The unique identifier stored in the database */
  databaseId: Scalars["Int"]["output"];
};

/** Date values */
export type DateInput = {
  /** Day of the month (from 1 to 31) */
  day?: InputMaybe<Scalars["Int"]["input"]>;
  /** Month number (from 1 to 12) */
  month?: InputMaybe<Scalars["Int"]["input"]>;
  /** 4 digit year (e.g. 2017) */
  year?: InputMaybe<Scalars["Int"]["input"]>;
};

/** Filter the connection based on input */
export type DateQueryInput = {
  /** Nodes should be returned after this date */
  after?: InputMaybe<DateInput>;
  /** Nodes should be returned before this date */
  before?: InputMaybe<DateInput>;
  /** Column to query against */
  column?: InputMaybe<PostObjectsConnectionDateColumnEnum>;
  /** For after/before, whether exact value should be matched or not */
  compare?: InputMaybe<Scalars["String"]["input"]>;
  /** Day of the month (from 1 to 31) */
  day?: InputMaybe<Scalars["Int"]["input"]>;
  /** Hour (from 0 to 23) */
  hour?: InputMaybe<Scalars["Int"]["input"]>;
  /** For after/before, whether exact value should be matched or not */
  inclusive?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Minute (from 0 to 59) */
  minute?: InputMaybe<Scalars["Int"]["input"]>;
  /** Month number (from 1 to 12) */
  month?: InputMaybe<Scalars["Int"]["input"]>;
  /** OR or AND, how the sub-arrays should be compared */
  relation?: InputMaybe<RelationEnum>;
  /** Second (0 to 59) */
  second?: InputMaybe<Scalars["Int"]["input"]>;
  /** Week of the year (from 0 to 53) */
  week?: InputMaybe<Scalars["Int"]["input"]>;
  /** 4 digit year (e.g. 2017) */
  year?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The template assigned to the node */
export type DefaultTemplate = ContentTemplate & {
  __typename?: "DefaultTemplate";
  /** The name of the template */
  templateName?: Maybe<Scalars["String"]["output"]>;
};

/** Input for the deleteCategory mutation. */
export type DeleteCategoryInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the category to delete */
  id: Scalars["ID"]["input"];
};

/** The payload for the deleteCategory mutation. */
export type DeleteCategoryPayload = {
  __typename?: "DeleteCategoryPayload";
  /** The deleted term object */
  category?: Maybe<Category>;
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The ID of the deleted object */
  deletedId?: Maybe<Scalars["ID"]["output"]>;
};

/** Input for the deleteComment mutation. */
export type DeleteCommentInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** Whether the comment should be force deleted instead of being moved to the trash */
  forceDelete?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** The deleted comment ID */
  id: Scalars["ID"]["input"];
};

/** The payload for the deleteComment mutation. */
export type DeleteCommentPayload = {
  __typename?: "DeleteCommentPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The deleted comment object */
  comment?: Maybe<Comment>;
  /** The deleted comment ID */
  deletedId?: Maybe<Scalars["ID"]["output"]>;
};

/** Input for the deleteMediaItem mutation. */
export type DeleteMediaItemInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** Whether the mediaItem should be force deleted instead of being moved to the trash */
  forceDelete?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** The ID of the mediaItem to delete */
  id: Scalars["ID"]["input"];
};

/** The payload for the deleteMediaItem mutation. */
export type DeleteMediaItemPayload = {
  __typename?: "DeleteMediaItemPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The ID of the deleted mediaItem */
  deletedId?: Maybe<Scalars["ID"]["output"]>;
  /** The mediaItem before it was deleted */
  mediaItem?: Maybe<MediaItem>;
};

/** Input for the deletePage mutation. */
export type DeletePageInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** Whether the object should be force deleted instead of being moved to the trash */
  forceDelete?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** The ID of the page to delete */
  id: Scalars["ID"]["input"];
  /** Override the edit lock when another user is editing the post */
  ignoreEditLock?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** The payload for the deletePage mutation. */
export type DeletePagePayload = {
  __typename?: "DeletePagePayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The ID of the deleted object */
  deletedId?: Maybe<Scalars["ID"]["output"]>;
  /** The object before it was deleted */
  page?: Maybe<Page>;
};

/** Input for the deletePostFormat mutation. */
export type DeletePostFormatInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the postFormat to delete */
  id: Scalars["ID"]["input"];
};

/** The payload for the deletePostFormat mutation. */
export type DeletePostFormatPayload = {
  __typename?: "DeletePostFormatPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The ID of the deleted object */
  deletedId?: Maybe<Scalars["ID"]["output"]>;
  /** The deleted term object */
  postFormat?: Maybe<PostFormat>;
};

/** Input for the deletePost mutation. */
export type DeletePostInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** Whether the object should be force deleted instead of being moved to the trash */
  forceDelete?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** The ID of the post to delete */
  id: Scalars["ID"]["input"];
  /** Override the edit lock when another user is editing the post */
  ignoreEditLock?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** The payload for the deletePost mutation. */
export type DeletePostPayload = {
  __typename?: "DeletePostPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The ID of the deleted object */
  deletedId?: Maybe<Scalars["ID"]["output"]>;
  /** The object before it was deleted */
  post?: Maybe<Post>;
};

/** Input for the deleteTag mutation. */
export type DeleteTagInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the tag to delete */
  id: Scalars["ID"]["input"];
};

/** The payload for the deleteTag mutation. */
export type DeleteTagPayload = {
  __typename?: "DeleteTagPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The ID of the deleted object */
  deletedId?: Maybe<Scalars["ID"]["output"]>;
  /** The deleted term object */
  tag?: Maybe<Tag>;
};

/** Input for the deleteUser mutation. */
export type DeleteUserInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the user you want to delete */
  id: Scalars["ID"]["input"];
  /** Reassign posts and links to new User ID. */
  reassignId?: InputMaybe<Scalars["ID"]["input"]>;
};

/** The payload for the deleteUser mutation. */
export type DeleteUserPayload = {
  __typename?: "DeleteUserPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The ID of the user that you just deleted */
  deletedId?: Maybe<Scalars["ID"]["output"]>;
  /** The deleted user object */
  user?: Maybe<User>;
};

/** The discussion setting type */
export type DiscussionSettings = {
  __typename?: "DiscussionSettings";
  /** Allow people to submit comments on new posts. */
  defaultCommentStatus?: Maybe<Scalars["String"]["output"]>;
  /** Allow link notifications from other blogs (pingbacks and trackbacks) on new articles. */
  defaultPingStatus?: Maybe<Scalars["String"]["output"]>;
};

/** Relational context between connected nodes */
export type Edge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected node */
  node: Node;
};

/** Asset enqueued by the CMS */
export type EnqueuedAsset = {
  /** The inline code to be run after the asset is loaded. */
  after?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
  /**
   * Deprecated
   * @deprecated Use `EnqueuedAsset.media` instead.
   */
  args?: Maybe<Scalars["Boolean"]["output"]>;
  /** The inline code to be run before the asset is loaded. */
  before?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
  /** The HTML conditional comment for the enqueued asset. E.g. IE 6, lte IE 7, etc */
  conditional?: Maybe<Scalars["String"]["output"]>;
  /** Dependencies needed to use this asset */
  dependencies?: Maybe<Array<Maybe<EnqueuedAsset>>>;
  /**
   * Extra information needed for the script
   * @deprecated Use `EnqueuedScript.extraData` instead.
   */
  extra?: Maybe<Scalars["String"]["output"]>;
  /** The handle of the enqueued asset */
  handle?: Maybe<Scalars["String"]["output"]>;
  /** The ID of the enqueued asset */
  id: Scalars["ID"]["output"];
  /** The source of the asset */
  src?: Maybe<Scalars["String"]["output"]>;
  /** The version of the enqueued asset */
  version?: Maybe<Scalars["String"]["output"]>;
};

/** Script enqueued by the CMS */
export type EnqueuedScript = EnqueuedAsset &
  Node & {
    __typename?: "EnqueuedScript";
    /** The inline code to be run after the asset is loaded. */
    after?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
    /**
     * Deprecated
     * @deprecated Use `EnqueuedAsset.media` instead.
     */
    args?: Maybe<Scalars["Boolean"]["output"]>;
    /** The inline code to be run before the asset is loaded. */
    before?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
    /** The HTML conditional comment for the enqueued asset. E.g. IE 6, lte IE 7, etc */
    conditional?: Maybe<Scalars["String"]["output"]>;
    /** Dependencies needed to use this asset */
    dependencies?: Maybe<Array<Maybe<EnqueuedScript>>>;
    /**
     * Extra information needed for the script
     * @deprecated Use `EnqueuedScript.extraData` instead.
     */
    extra?: Maybe<Scalars["String"]["output"]>;
    /** Extra data supplied to the enqueued script */
    extraData?: Maybe<Scalars["String"]["output"]>;
    /** The handle of the enqueued asset */
    handle?: Maybe<Scalars["String"]["output"]>;
    /** The global ID of the enqueued script */
    id: Scalars["ID"]["output"];
    /** The source of the asset */
    src?: Maybe<Scalars["String"]["output"]>;
    /** The loading strategy to use on the script tag */
    strategy?: Maybe<ScriptLoadingStrategyEnum>;
    /** The version of the enqueued script */
    version?: Maybe<Scalars["String"]["output"]>;
  };

/** Connection to EnqueuedScript Nodes */
export type EnqueuedScriptConnection = {
  /** A list of edges (relational context) between ContentNode and connected EnqueuedScript Nodes */
  edges: Array<EnqueuedScriptConnectionEdge>;
  /** A list of connected EnqueuedScript Nodes */
  nodes: Array<EnqueuedScript>;
  /** Information about pagination in a connection. */
  pageInfo: EnqueuedScriptConnectionPageInfo;
};

/** Edge between a Node and a connected EnqueuedScript */
export type EnqueuedScriptConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected EnqueuedScript Node */
  node: EnqueuedScript;
};

/** Page Info on the connected EnqueuedScriptConnectionEdge */
export type EnqueuedScriptConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** Stylesheet enqueued by the CMS */
export type EnqueuedStylesheet = EnqueuedAsset &
  Node & {
    __typename?: "EnqueuedStylesheet";
    /** The inline code to be run after the asset is loaded. */
    after?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
    /**
     * Deprecated
     * @deprecated Use `EnqueuedAsset.media` instead.
     */
    args?: Maybe<Scalars["Boolean"]["output"]>;
    /** The inline code to be run before the asset is loaded. */
    before?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
    /** The HTML conditional comment for the enqueued asset. E.g. IE 6, lte IE 7, etc */
    conditional?: Maybe<Scalars["String"]["output"]>;
    /** Dependencies needed to use this asset */
    dependencies?: Maybe<Array<Maybe<EnqueuedStylesheet>>>;
    /**
     * Extra information needed for the script
     * @deprecated Use `EnqueuedScript.extraData` instead.
     */
    extra?: Maybe<Scalars["String"]["output"]>;
    /** The handle of the enqueued asset */
    handle?: Maybe<Scalars["String"]["output"]>;
    /** The global ID of the enqueued stylesheet */
    id: Scalars["ID"]["output"];
    /** Whether the enqueued style is RTL or not */
    isRtl?: Maybe<Scalars["Boolean"]["output"]>;
    /** The media attribute to use for the link */
    media?: Maybe<Scalars["String"]["output"]>;
    /** The absolute path to the enqueued style. Set when the stylesheet is meant to load inline. */
    path?: Maybe<Scalars["String"]["output"]>;
    /** The `rel` attribute to use for the link */
    rel?: Maybe<Scalars["String"]["output"]>;
    /** The source of the asset */
    src?: Maybe<Scalars["String"]["output"]>;
    /** Optional suffix, used in combination with RTL */
    suffix?: Maybe<Scalars["String"]["output"]>;
    /** The title of the enqueued style. Used for preferred/alternate stylesheets. */
    title?: Maybe<Scalars["String"]["output"]>;
    /** The version of the enqueued style */
    version?: Maybe<Scalars["String"]["output"]>;
  };

/** Connection to EnqueuedStylesheet Nodes */
export type EnqueuedStylesheetConnection = {
  /** A list of edges (relational context) between ContentNode and connected EnqueuedStylesheet Nodes */
  edges: Array<EnqueuedStylesheetConnectionEdge>;
  /** A list of connected EnqueuedStylesheet Nodes */
  nodes: Array<EnqueuedStylesheet>;
  /** Information about pagination in a connection. */
  pageInfo: EnqueuedStylesheetConnectionPageInfo;
};

/** Edge between a Node and a connected EnqueuedStylesheet */
export type EnqueuedStylesheetConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected EnqueuedStylesheet Node */
  node: EnqueuedStylesheet;
};

/** Page Info on the connected EnqueuedStylesheetConnectionEdge */
export type EnqueuedStylesheetConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** The general setting type */
export type GeneralSettings = {
  __typename?: "GeneralSettings";
  /** A date format for all date strings. */
  dateFormat?: Maybe<Scalars["String"]["output"]>;
  /** Site tagline. */
  description?: Maybe<Scalars["String"]["output"]>;
  /** This address is used for admin purposes, like new user notification. */
  email?: Maybe<Scalars["String"]["output"]>;
  /** WordPress locale code. */
  language?: Maybe<Scalars["String"]["output"]>;
  /** A day number of the week that the week should start on. */
  startOfWeek?: Maybe<Scalars["Int"]["output"]>;
  /** A time format for all time strings. */
  timeFormat?: Maybe<Scalars["String"]["output"]>;
  /** A city in the same timezone as you. */
  timezone?: Maybe<Scalars["String"]["output"]>;
  /** Site title. */
  title?: Maybe<Scalars["String"]["output"]>;
  /** Site URL. */
  url?: Maybe<Scalars["String"]["output"]>;
};

/** Content node with hierarchical (parent/child) relationships */
export type HierarchicalContentNode = {
  /** Returns ancestors of the node. Default ordered as lowest (closest to the child) to highest (closest to the root). */
  ancestors?: Maybe<HierarchicalContentNodeToContentNodeAncestorsConnection>;
  /** Connection between the HierarchicalContentNode type and the ContentNode type */
  children?: Maybe<HierarchicalContentNodeToContentNodeChildrenConnection>;
  /** Connection between the ContentNode type and the ContentType type */
  contentType?: Maybe<ContentNodeToContentTypeConnectionEdge>;
  /** The name of the Content Type the node belongs to */
  contentTypeName: Scalars["String"]["output"];
  /** The unique identifier stored in the database */
  databaseId: Scalars["Int"]["output"];
  /** Post publishing date. */
  date?: Maybe<Scalars["String"]["output"]>;
  /** The publishing date set in GMT. */
  dateGmt?: Maybe<Scalars["String"]["output"]>;
  /** The desired slug of the post */
  desiredSlug?: Maybe<Scalars["String"]["output"]>;
  /** If a user has edited the node within the past 15 seconds, this will return the user that last edited. Null if the edit lock doesn&#039;t exist or is greater than 15 seconds */
  editingLockedBy?: Maybe<ContentNodeToEditLockConnectionEdge>;
  /** The RSS enclosure for the object */
  enclosure?: Maybe<Scalars["String"]["output"]>;
  /** Connection between the ContentNode type and the EnqueuedScript type */
  enqueuedScripts?: Maybe<ContentNodeToEnqueuedScriptConnection>;
  /** Connection between the ContentNode type and the EnqueuedStylesheet type */
  enqueuedStylesheets?: Maybe<ContentNodeToEnqueuedStylesheetConnection>;
  /** The global unique identifier for this post. This currently matches the value stored in WP_Post-&gt;guid and the guid column in the &quot;post_objects&quot; database table. */
  guid?: Maybe<Scalars["String"]["output"]>;
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
  /** Whether the node is a Content Node */
  isContentNode: Scalars["Boolean"]["output"];
  /** Whether the object is a node in the preview state */
  isPreview?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether the object is restricted from the current viewer */
  isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether the node is a Term */
  isTermNode: Scalars["Boolean"]["output"];
  /** The user that most recently edited the node */
  lastEditedBy?: Maybe<ContentNodeToEditLastConnectionEdge>;
  /** The permalink of the post */
  link?: Maybe<Scalars["String"]["output"]>;
  /** The local modified time for a post. If a post was recently updated the modified field will change to match the corresponding time. */
  modified?: Maybe<Scalars["String"]["output"]>;
  /** The GMT modified time for a post. If a post was recently updated the modified field will change to match the corresponding time in GMT. */
  modifiedGmt?: Maybe<Scalars["String"]["output"]>;
  /** The parent of the node. The parent object can be of various types */
  parent?: Maybe<HierarchicalContentNodeToParentContentNodeConnectionEdge>;
  /** Database id of the parent node */
  parentDatabaseId?: Maybe<Scalars["Int"]["output"]>;
  /** The globally unique identifier of the parent node. */
  parentId?: Maybe<Scalars["ID"]["output"]>;
  /** The database id of the preview node */
  previewRevisionDatabaseId?: Maybe<Scalars["Int"]["output"]>;
  /** Whether the object is a node in the preview state */
  previewRevisionId?: Maybe<Scalars["ID"]["output"]>;
  /** The Yoast SEO data of the ContentNode */
  seo?: Maybe<PostTypeSeo>;
  /** The uri slug for the post. This is equivalent to the WP_Post-&gt;post_name field and the post_name column in the database for the &quot;post_objects&quot; table. */
  slug?: Maybe<Scalars["String"]["output"]>;
  /** The current status of the object */
  status?: Maybe<Scalars["String"]["output"]>;
  /** The template assigned to a node of content */
  template?: Maybe<ContentTemplate>;
  /** The unique resource identifier path */
  uri?: Maybe<Scalars["String"]["output"]>;
};

/** Content node with hierarchical (parent/child) relationships */
export type HierarchicalContentNodeAncestorsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<HierarchicalContentNodeToContentNodeAncestorsConnectionWhereArgs>;
};

/** Content node with hierarchical (parent/child) relationships */
export type HierarchicalContentNodeChildrenArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<HierarchicalContentNodeToContentNodeChildrenConnectionWhereArgs>;
};

/** Content node with hierarchical (parent/child) relationships */
export type HierarchicalContentNodeEnqueuedScriptsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** Content node with hierarchical (parent/child) relationships */
export type HierarchicalContentNodeEnqueuedStylesheetsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** Connection between the HierarchicalContentNode type and the ContentNode type */
export type HierarchicalContentNodeToContentNodeAncestorsConnection =
  Connection &
    ContentNodeConnection & {
      __typename?: "HierarchicalContentNodeToContentNodeAncestorsConnection";
      /** Edges for the HierarchicalContentNodeToContentNodeAncestorsConnection connection */
      edges: Array<HierarchicalContentNodeToContentNodeAncestorsConnectionEdge>;
      /** The nodes of the connection, without the edges */
      nodes: Array<ContentNode>;
      /** Information about pagination in a connection. */
      pageInfo: HierarchicalContentNodeToContentNodeAncestorsConnectionPageInfo;
    };

/** An edge in a connection */
export type HierarchicalContentNodeToContentNodeAncestorsConnectionEdge =
  ContentNodeConnectionEdge &
    Edge & {
      __typename?: "HierarchicalContentNodeToContentNodeAncestorsConnectionEdge";
      /** A cursor for use in pagination */
      cursor?: Maybe<Scalars["String"]["output"]>;
      /** The item at the end of the edge */
      node: ContentNode;
    };

/** Page Info on the &quot;HierarchicalContentNodeToContentNodeAncestorsConnection&quot; */
export type HierarchicalContentNodeToContentNodeAncestorsConnectionPageInfo =
  ContentNodeConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "HierarchicalContentNodeToContentNodeAncestorsConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Arguments for filtering the HierarchicalContentNodeToContentNodeAncestorsConnection connection */
export type HierarchicalContentNodeToContentNodeAncestorsConnectionWhereArgs = {
  /** The Types of content to filter */
  contentTypes?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the HierarchicalContentNode type and the ContentNode type */
export type HierarchicalContentNodeToContentNodeChildrenConnection =
  Connection &
    ContentNodeConnection & {
      __typename?: "HierarchicalContentNodeToContentNodeChildrenConnection";
      /** Edges for the HierarchicalContentNodeToContentNodeChildrenConnection connection */
      edges: Array<HierarchicalContentNodeToContentNodeChildrenConnectionEdge>;
      /** The nodes of the connection, without the edges */
      nodes: Array<ContentNode>;
      /** Information about pagination in a connection. */
      pageInfo: HierarchicalContentNodeToContentNodeChildrenConnectionPageInfo;
    };

/** An edge in a connection */
export type HierarchicalContentNodeToContentNodeChildrenConnectionEdge =
  ContentNodeConnectionEdge &
    Edge & {
      __typename?: "HierarchicalContentNodeToContentNodeChildrenConnectionEdge";
      /** A cursor for use in pagination */
      cursor?: Maybe<Scalars["String"]["output"]>;
      /** The item at the end of the edge */
      node: ContentNode;
    };

/** Page Info on the &quot;HierarchicalContentNodeToContentNodeChildrenConnection&quot; */
export type HierarchicalContentNodeToContentNodeChildrenConnectionPageInfo =
  ContentNodeConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "HierarchicalContentNodeToContentNodeChildrenConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Arguments for filtering the HierarchicalContentNodeToContentNodeChildrenConnection connection */
export type HierarchicalContentNodeToContentNodeChildrenConnectionWhereArgs = {
  /** The Types of content to filter */
  contentTypes?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the HierarchicalContentNode type and the ContentNode type */
export type HierarchicalContentNodeToParentContentNodeConnectionEdge =
  ContentNodeConnectionEdge &
    Edge &
    OneToOneConnection & {
      __typename?: "HierarchicalContentNodeToParentContentNodeConnectionEdge";
      /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
      cursor?: Maybe<Scalars["String"]["output"]>;
      /** The node of the connection, without the edges */
      node: ContentNode;
    };

/** Node with hierarchical (parent/child) relationships */
export type HierarchicalNode = {
  /** The unique identifier stored in the database */
  databaseId: Scalars["Int"]["output"];
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
  /** Database id of the parent node */
  parentDatabaseId?: Maybe<Scalars["Int"]["output"]>;
  /** The globally unique identifier of the parent node. */
  parentId?: Maybe<Scalars["ID"]["output"]>;
};

/** Term node with hierarchical (parent/child) relationships */
export type HierarchicalTermNode = {
  /** The number of objects connected to the object */
  count?: Maybe<Scalars["Int"]["output"]>;
  /** The unique identifier stored in the database */
  databaseId: Scalars["Int"]["output"];
  /** The description of the object */
  description?: Maybe<Scalars["String"]["output"]>;
  /** Connection between the TermNode type and the EnqueuedScript type */
  enqueuedScripts?: Maybe<TermNodeToEnqueuedScriptConnection>;
  /** Connection between the TermNode type and the EnqueuedStylesheet type */
  enqueuedStylesheets?: Maybe<TermNodeToEnqueuedStylesheetConnection>;
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
  /** Whether the node is a Content Node */
  isContentNode: Scalars["Boolean"]["output"];
  /** Whether the object is restricted from the current viewer */
  isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether the node is a Term */
  isTermNode: Scalars["Boolean"]["output"];
  /** The link to the term */
  link?: Maybe<Scalars["String"]["output"]>;
  /** The human friendly name of the object. */
  name?: Maybe<Scalars["String"]["output"]>;
  /** Database id of the parent node */
  parentDatabaseId?: Maybe<Scalars["Int"]["output"]>;
  /** The globally unique identifier of the parent node. */
  parentId?: Maybe<Scalars["ID"]["output"]>;
  /** An alphanumeric identifier for the object unique to its type. */
  slug?: Maybe<Scalars["String"]["output"]>;
  /** The name of the taxonomy that the object is associated with */
  taxonomyName?: Maybe<Scalars["String"]["output"]>;
  /** The ID of the term group that this term object belongs to */
  termGroupId?: Maybe<Scalars["Int"]["output"]>;
  /** The taxonomy ID that the object is associated with */
  termTaxonomyId?: Maybe<Scalars["Int"]["output"]>;
  /** The unique resource identifier path */
  uri?: Maybe<Scalars["String"]["output"]>;
};

/** Term node with hierarchical (parent/child) relationships */
export type HierarchicalTermNodeEnqueuedScriptsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** Term node with hierarchical (parent/child) relationships */
export type HierarchicalTermNodeEnqueuedStylesheetsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** Input for the login mutation. */
export type LoginInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The plain-text password for the user logging in. */
  password: Scalars["String"]["input"];
  /** The username used for login. Typically a unique or email address depending on specific configuration */
  username: Scalars["String"]["input"];
};

/** The payload for the login mutation. */
export type LoginPayload = {
  __typename?: "LoginPayload";
  /** JWT Token that can be used in future requests for Authentication */
  authToken?: Maybe<Scalars["String"]["output"]>;
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** A JWT token that can be used in future requests to get a refreshed jwtAuthToken. If the refresh token used in a request is revoked or otherwise invalid, a valid Auth token will NOT be issued in the response headers. */
  refreshToken?: Maybe<Scalars["String"]["output"]>;
  /** The user that was logged in */
  user?: Maybe<User>;
};

/** File details for a Media Item */
export type MediaDetails = {
  __typename?: "MediaDetails";
  /** The filename of the mediaItem */
  file?: Maybe<Scalars["String"]["output"]>;
  /** The height of the mediaItem */
  height?: Maybe<Scalars["Int"]["output"]>;
  /** Meta information associated with the mediaItem */
  meta?: Maybe<MediaItemMeta>;
  /** The available sizes of the mediaItem */
  sizes?: Maybe<Array<Maybe<MediaSize>>>;
  /** The width of the mediaItem */
  width?: Maybe<Scalars["Int"]["output"]>;
};

/** File details for a Media Item */
export type MediaDetailsSizesArgs = {
  exclude?: InputMaybe<Array<InputMaybe<MediaItemSizeEnum>>>;
  include?: InputMaybe<Array<InputMaybe<MediaItemSizeEnum>>>;
};

/** The mediaItem type */
export type MediaItem = ContentNode &
  DatabaseIdentifier &
  HierarchicalContentNode &
  HierarchicalNode &
  Node &
  NodeWithAuthor &
  NodeWithComments &
  NodeWithTemplate &
  NodeWithTitle &
  UniformResourceIdentifiable & {
    __typename?: "MediaItem";
    /** Alternative text to display when resource is not displayed */
    altText?: Maybe<Scalars["String"]["output"]>;
    /** Returns ancestors of the node. Default ordered as lowest (closest to the child) to highest (closest to the root). */
    ancestors?: Maybe<HierarchicalContentNodeToContentNodeAncestorsConnection>;
    /** Connection between the NodeWithAuthor type and the User type */
    author?: Maybe<NodeWithAuthorToUserConnectionEdge>;
    /** The database identifier of the author of the node */
    authorDatabaseId?: Maybe<Scalars["Int"]["output"]>;
    /** The globally unique identifier of the author of the node */
    authorId?: Maybe<Scalars["ID"]["output"]>;
    /** The caption for the resource */
    caption?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the HierarchicalContentNode type and the ContentNode type */
    children?: Maybe<HierarchicalContentNodeToContentNodeChildrenConnection>;
    /** The number of comments. Even though WPGraphQL denotes this field as an integer, in WordPress this field should be saved as a numeric string for compatibility. */
    commentCount?: Maybe<Scalars["Int"]["output"]>;
    /** Whether the comments are open or closed for this particular post. */
    commentStatus?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the MediaItem type and the Comment type */
    comments?: Maybe<MediaItemToCommentConnection>;
    /** Connection between the ContentNode type and the ContentType type */
    contentType?: Maybe<ContentNodeToContentTypeConnectionEdge>;
    /** The name of the Content Type the node belongs to */
    contentTypeName: Scalars["String"]["output"];
    /** The unique identifier stored in the database */
    databaseId: Scalars["Int"]["output"];
    /** Post publishing date. */
    date?: Maybe<Scalars["String"]["output"]>;
    /** The publishing date set in GMT. */
    dateGmt?: Maybe<Scalars["String"]["output"]>;
    /** Description of the image (stored as post_content) */
    description?: Maybe<Scalars["String"]["output"]>;
    /** The desired slug of the post */
    desiredSlug?: Maybe<Scalars["String"]["output"]>;
    /** If a user has edited the node within the past 15 seconds, this will return the user that last edited. Null if the edit lock doesn&#039;t exist or is greater than 15 seconds */
    editingLockedBy?: Maybe<ContentNodeToEditLockConnectionEdge>;
    /** The RSS enclosure for the object */
    enclosure?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the ContentNode type and the EnqueuedScript type */
    enqueuedScripts?: Maybe<ContentNodeToEnqueuedScriptConnection>;
    /** Connection between the ContentNode type and the EnqueuedStylesheet type */
    enqueuedStylesheets?: Maybe<ContentNodeToEnqueuedStylesheetConnection>;
    /** The filesize in bytes of the resource */
    fileSize?: Maybe<Scalars["Int"]["output"]>;
    /** The global unique identifier for this post. This currently matches the value stored in WP_Post-&gt;guid and the guid column in the &quot;post_objects&quot; database table. */
    guid?: Maybe<Scalars["String"]["output"]>;
    /** The globally unique identifier of the attachment object. */
    id: Scalars["ID"]["output"];
    /** Whether the node is a Content Node */
    isContentNode: Scalars["Boolean"]["output"];
    /** Whether the object is a node in the preview state */
    isPreview?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether the object is restricted from the current viewer */
    isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether the node is a Term */
    isTermNode: Scalars["Boolean"]["output"];
    /** The user that most recently edited the node */
    lastEditedBy?: Maybe<ContentNodeToEditLastConnectionEdge>;
    /** The permalink of the post */
    link?: Maybe<Scalars["String"]["output"]>;
    /** Details about the mediaItem */
    mediaDetails?: Maybe<MediaDetails>;
    /**
     * The id field matches the WP_Post-&gt;ID field.
     * @deprecated Deprecated in favor of the databaseId field
     */
    mediaItemId: Scalars["Int"]["output"];
    /** Url of the mediaItem */
    mediaItemUrl?: Maybe<Scalars["String"]["output"]>;
    /** Type of resource */
    mediaType?: Maybe<Scalars["String"]["output"]>;
    /** The mime type of the mediaItem */
    mimeType?: Maybe<Scalars["String"]["output"]>;
    /** The local modified time for a post. If a post was recently updated the modified field will change to match the corresponding time. */
    modified?: Maybe<Scalars["String"]["output"]>;
    /** The GMT modified time for a post. If a post was recently updated the modified field will change to match the corresponding time in GMT. */
    modifiedGmt?: Maybe<Scalars["String"]["output"]>;
    /** The parent of the node. The parent object can be of various types */
    parent?: Maybe<HierarchicalContentNodeToParentContentNodeConnectionEdge>;
    /** Database id of the parent node */
    parentDatabaseId?: Maybe<Scalars["Int"]["output"]>;
    /** The globally unique identifier of the parent node. */
    parentId?: Maybe<Scalars["ID"]["output"]>;
    /** The database id of the preview node */
    previewRevisionDatabaseId?: Maybe<Scalars["Int"]["output"]>;
    /** Whether the object is a node in the preview state */
    previewRevisionId?: Maybe<Scalars["ID"]["output"]>;
    /** The Yoast SEO data of the ContentNode */
    seo?: Maybe<PostTypeSeo>;
    /** The sizes attribute value for an image. */
    sizes?: Maybe<Scalars["String"]["output"]>;
    /** The uri slug for the post. This is equivalent to the WP_Post-&gt;post_name field and the post_name column in the database for the &quot;post_objects&quot; table. */
    slug?: Maybe<Scalars["String"]["output"]>;
    /** Url of the mediaItem */
    sourceUrl?: Maybe<Scalars["String"]["output"]>;
    /** The srcset attribute specifies the URL of the image to use in different situations. It is a comma separated string of urls and their widths. */
    srcSet?: Maybe<Scalars["String"]["output"]>;
    /** The current status of the object */
    status?: Maybe<Scalars["String"]["output"]>;
    /** The template assigned to a node of content */
    template?: Maybe<ContentTemplate>;
    /** The title of the post. This is currently just the raw title. An amendment to support rendered title needs to be made. */
    title?: Maybe<Scalars["String"]["output"]>;
    /** The unique resource identifier path */
    uri?: Maybe<Scalars["String"]["output"]>;
  };

/** The mediaItem type */
export type MediaItemAncestorsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<HierarchicalContentNodeToContentNodeAncestorsConnectionWhereArgs>;
};

/** The mediaItem type */
export type MediaItemCaptionArgs = {
  format?: InputMaybe<PostObjectFieldFormatEnum>;
};

/** The mediaItem type */
export type MediaItemChildrenArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<HierarchicalContentNodeToContentNodeChildrenConnectionWhereArgs>;
};

/** The mediaItem type */
export type MediaItemCommentsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<MediaItemToCommentConnectionWhereArgs>;
};

/** The mediaItem type */
export type MediaItemDescriptionArgs = {
  format?: InputMaybe<PostObjectFieldFormatEnum>;
};

/** The mediaItem type */
export type MediaItemEnqueuedScriptsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The mediaItem type */
export type MediaItemEnqueuedStylesheetsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The mediaItem type */
export type MediaItemFileSizeArgs = {
  size?: InputMaybe<MediaItemSizeEnum>;
};

/** The mediaItem type */
export type MediaItemSizesArgs = {
  size?: InputMaybe<MediaItemSizeEnum>;
};

/** The mediaItem type */
export type MediaItemSourceUrlArgs = {
  size?: InputMaybe<MediaItemSizeEnum>;
};

/** The mediaItem type */
export type MediaItemSrcSetArgs = {
  size?: InputMaybe<MediaItemSizeEnum>;
};

/** The mediaItem type */
export type MediaItemTitleArgs = {
  format?: InputMaybe<PostObjectFieldFormatEnum>;
};

/** Connection to mediaItem Nodes */
export type MediaItemConnection = {
  /** A list of edges (relational context) between RootQuery and connected mediaItem Nodes */
  edges: Array<MediaItemConnectionEdge>;
  /** A list of connected mediaItem Nodes */
  nodes: Array<MediaItem>;
  /** Information about pagination in a connection. */
  pageInfo: MediaItemConnectionPageInfo;
};

/** Edge between a Node and a connected mediaItem */
export type MediaItemConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected mediaItem Node */
  node: MediaItem;
};

/** Page Info on the connected MediaItemConnectionEdge */
export type MediaItemConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** The Type of Identifier used to fetch a single resource. Default is ID. */
export enum MediaItemIdType {
  /** Identify a resource by the Database ID. */
  DatabaseId = "DATABASE_ID",
  /** Identify a resource by the (hashed) Global ID. */
  Id = "ID",
  /** Identify a resource by the slug. Available to non-hierarchcial Types where the slug is a unique identifier. */
  Slug = "SLUG",
  /** Identify a media item by its source url */
  SourceUrl = "SOURCE_URL",
  /** Identify a resource by the URI. */
  Uri = "URI",
}

/** Meta connected to a MediaItem */
export type MediaItemMeta = {
  __typename?: "MediaItemMeta";
  /** Aperture measurement of the media item. */
  aperture?: Maybe<Scalars["Float"]["output"]>;
  /** Information about the camera used to create the media item. */
  camera?: Maybe<Scalars["String"]["output"]>;
  /** The text string description associated with the media item. */
  caption?: Maybe<Scalars["String"]["output"]>;
  /** Copyright information associated with the media item. */
  copyright?: Maybe<Scalars["String"]["output"]>;
  /** The date/time when the media was created. */
  createdTimestamp?: Maybe<Scalars["Int"]["output"]>;
  /** The original creator of the media item. */
  credit?: Maybe<Scalars["String"]["output"]>;
  /** The focal length value of the media item. */
  focalLength?: Maybe<Scalars["Float"]["output"]>;
  /** The ISO (International Organization for Standardization) value of the media item. */
  iso?: Maybe<Scalars["Int"]["output"]>;
  /** List of keywords used to describe or identfy the media item. */
  keywords?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
  /** The vertical or horizontal aspect of the media item. */
  orientation?: Maybe<Scalars["String"]["output"]>;
  /** The shutter speed information of the media item. */
  shutterSpeed?: Maybe<Scalars["Float"]["output"]>;
  /** A useful title for the media item. */
  title?: Maybe<Scalars["String"]["output"]>;
};

/** The size of the media item object. */
export enum MediaItemSizeEnum {
  /** MediaItem with the large size */
  Large = "LARGE",
  /** MediaItem with the medium size */
  Medium = "MEDIUM",
  /** MediaItem with the medium_large size */
  MediumLarge = "MEDIUM_LARGE",
  /** MediaItem with the thumbnail size */
  Thumbnail = "THUMBNAIL",
  /** MediaItem with the 1536x1536 size */
  "1536X1536" = "_1536X1536",
  /** MediaItem with the 2048x2048 size */
  "2048X2048" = "_2048X2048",
}

/** The status of the media item object. */
export enum MediaItemStatusEnum {
  /** Objects with the auto-draft status */
  AutoDraft = "AUTO_DRAFT",
  /** Objects with the inherit status */
  Inherit = "INHERIT",
  /** Objects with the private status */
  Private = "PRIVATE",
  /** Objects with the trash status */
  Trash = "TRASH",
}

/** Connection between the MediaItem type and the Comment type */
export type MediaItemToCommentConnection = CommentConnection &
  Connection & {
    __typename?: "MediaItemToCommentConnection";
    /** Edges for the MediaItemToCommentConnection connection */
    edges: Array<MediaItemToCommentConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Comment>;
    /** Information about pagination in a connection. */
    pageInfo: MediaItemToCommentConnectionPageInfo;
  };

/** An edge in a connection */
export type MediaItemToCommentConnectionEdge = CommentConnectionEdge &
  Edge & {
    __typename?: "MediaItemToCommentConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Comment;
  };

/** Page Info on the &quot;MediaItemToCommentConnection&quot; */
export type MediaItemToCommentConnectionPageInfo = CommentConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "MediaItemToCommentConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the MediaItemToCommentConnection connection */
export type MediaItemToCommentConnectionWhereArgs = {
  /** Comment author email address. */
  authorEmail?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of author IDs to include comments for. */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to exclude comments for. */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Comment author URL. */
  authorUrl?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of comment IDs to include. */
  commentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of IDs of users whose unapproved comments will be returned by the query regardless of status. */
  commentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Include comments of a given type. */
  commentType?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments from a given array of comment types. */
  commentTypeIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Exclude comments from a given array of comment types. */
  commentTypeNotIn?: InputMaybe<Scalars["String"]["input"]>;
  /** Content object author ID to limit results by. */
  contentAuthor?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to retrieve comments for. */
  contentAuthorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs *not* to retrieve comments for. */
  contentAuthorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Limit results to those affiliated with a given content object ID. */
  contentId?: InputMaybe<Scalars["ID"]["input"]>;
  /** Array of content object IDs to include affiliated comments for. */
  contentIdIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of content object IDs to exclude affiliated comments for. */
  contentIdNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Content object name (i.e. slug ) to retrieve affiliated comments for. */
  contentName?: InputMaybe<Scalars["String"]["input"]>;
  /** Content Object parent ID to retrieve affiliated comments for. */
  contentParent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of content object statuses to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentStatus?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Content object type or array of types to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentType?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Array of IDs or email addresses of users whose unapproved comments will be returned by the query regardless of $status. Default empty */
  includeUnapproved?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Karma score to retrieve matching comments for. */
  karma?: InputMaybe<Scalars["Int"]["input"]>;
  /** The cardinality of the order of the connection */
  order?: InputMaybe<OrderEnum>;
  /** Field to order the comments by. */
  orderby?: InputMaybe<CommentsConnectionOrderbyEnum>;
  /** Parent ID of comment to retrieve children of. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of parent IDs of comments to retrieve children for. */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of parent IDs of comments *not* to retrieve children for. */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Search term(s) to retrieve matching comments for. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Comment status to limit results by. */
  status?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments for a specific user ID. */
  userId?: InputMaybe<Scalars["ID"]["input"]>;
};

/** Details of an available size for a media item */
export type MediaSize = {
  __typename?: "MediaSize";
  /** The filename of the referenced size */
  file?: Maybe<Scalars["String"]["output"]>;
  /** The filesize of the resource */
  fileSize?: Maybe<Scalars["Int"]["output"]>;
  /** The height of the referenced size */
  height?: Maybe<Scalars["String"]["output"]>;
  /** The mime type of the referenced size */
  mimeType?: Maybe<Scalars["String"]["output"]>;
  /** The referenced size name */
  name?: Maybe<Scalars["String"]["output"]>;
  /** The url of the referenced size */
  sourceUrl?: Maybe<Scalars["String"]["output"]>;
  /** The width of the referenced size */
  width?: Maybe<Scalars["String"]["output"]>;
};

/** Menus are the containers for navigation items. Menus can be assigned to menu locations, which are typically registered by the active theme. */
export type Menu = DatabaseIdentifier &
  Node & {
    __typename?: "Menu";
    /** The number of items in the menu */
    count?: Maybe<Scalars["Int"]["output"]>;
    /** The unique identifier stored in the database */
    databaseId: Scalars["Int"]["output"];
    /** The globally unique identifier of the nav menu object. */
    id: Scalars["ID"]["output"];
    /** Whether the object is restricted from the current viewer */
    isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
    /** The locations a menu is assigned to */
    locations?: Maybe<Array<Maybe<MenuLocationEnum>>>;
    /**
     * WP ID of the nav menu.
     * @deprecated Deprecated in favor of the databaseId field
     */
    menuId?: Maybe<Scalars["Int"]["output"]>;
    /** Connection between the Menu type and the MenuItem type */
    menuItems?: Maybe<MenuToMenuItemConnection>;
    /** Display name of the menu. Equivalent to WP_Term-&gt;name. */
    name?: Maybe<Scalars["String"]["output"]>;
    /** The url friendly name of the menu. Equivalent to WP_Term-&gt;slug */
    slug?: Maybe<Scalars["String"]["output"]>;
  };

/** Menus are the containers for navigation items. Menus can be assigned to menu locations, which are typically registered by the active theme. */
export type MenuMenuItemsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<MenuToMenuItemConnectionWhereArgs>;
};

/** Connection to Menu Nodes */
export type MenuConnection = {
  /** A list of edges (relational context) between RootQuery and connected Menu Nodes */
  edges: Array<MenuConnectionEdge>;
  /** A list of connected Menu Nodes */
  nodes: Array<Menu>;
  /** Information about pagination in a connection. */
  pageInfo: MenuConnectionPageInfo;
};

/** Edge between a Node and a connected Menu */
export type MenuConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected Menu Node */
  node: Menu;
};

/** Page Info on the connected MenuConnectionEdge */
export type MenuConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** Navigation menu items are the individual items assigned to a menu. These are rendered as the links in a navigation menu. */
export type MenuItem = DatabaseIdentifier &
  Node & {
    __typename?: "MenuItem";
    /** Connection between the MenuItem type and the MenuItem type */
    childItems?: Maybe<MenuItemToMenuItemConnection>;
    /** Connection from MenuItem to it&#039;s connected node */
    connectedNode?: Maybe<MenuItemToMenuItemLinkableConnectionEdge>;
    /**
     * The object connected to this menu item.
     * @deprecated Deprecated in favor of the connectedNode field
     */
    connectedObject?: Maybe<MenuItemObjectUnion>;
    /** Class attribute for the menu item link */
    cssClasses?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
    /** The unique identifier stored in the database */
    databaseId: Scalars["Int"]["output"];
    /** Description of the menu item. */
    description?: Maybe<Scalars["String"]["output"]>;
    /** The globally unique identifier of the nav menu item object. */
    id: Scalars["ID"]["output"];
    /** Whether the object is restricted from the current viewer */
    isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
    /** Label or title of the menu item. */
    label?: Maybe<Scalars["String"]["output"]>;
    /** Link relationship (XFN) of the menu item. */
    linkRelationship?: Maybe<Scalars["String"]["output"]>;
    /** The locations the menu item&#039;s Menu is assigned to */
    locations?: Maybe<Array<Maybe<MenuLocationEnum>>>;
    /** The Menu a MenuItem is part of */
    menu?: Maybe<MenuItemToMenuConnectionEdge>;
    /**
     * WP ID of the menu item.
     * @deprecated Deprecated in favor of the databaseId field
     */
    menuItemId?: Maybe<Scalars["Int"]["output"]>;
    /** Menu item order */
    order?: Maybe<Scalars["Int"]["output"]>;
    /** The database id of the parent menu item or null if it is the root */
    parentDatabaseId?: Maybe<Scalars["Int"]["output"]>;
    /** The globally unique identifier of the parent nav menu item object. */
    parentId?: Maybe<Scalars["ID"]["output"]>;
    /** Path for the resource. Relative path for internal resources. Absolute path for external resources. */
    path?: Maybe<Scalars["String"]["output"]>;
    /** Target attribute for the menu item link. */
    target?: Maybe<Scalars["String"]["output"]>;
    /** Title attribute for the menu item link */
    title?: Maybe<Scalars["String"]["output"]>;
    /** The uri of the resource the menu item links to */
    uri?: Maybe<Scalars["String"]["output"]>;
    /** URL or destination of the menu item. */
    url?: Maybe<Scalars["String"]["output"]>;
  };

/** Navigation menu items are the individual items assigned to a menu. These are rendered as the links in a navigation menu. */
export type MenuItemChildItemsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<MenuItemToMenuItemConnectionWhereArgs>;
};

/** Connection to MenuItem Nodes */
export type MenuItemConnection = {
  /** A list of edges (relational context) between RootQuery and connected MenuItem Nodes */
  edges: Array<MenuItemConnectionEdge>;
  /** A list of connected MenuItem Nodes */
  nodes: Array<MenuItem>;
  /** Information about pagination in a connection. */
  pageInfo: MenuItemConnectionPageInfo;
};

/** Edge between a Node and a connected MenuItem */
export type MenuItemConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected MenuItem Node */
  node: MenuItem;
};

/** Page Info on the connected MenuItemConnectionEdge */
export type MenuItemConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** Nodes that can be linked to as Menu Items */
export type MenuItemLinkable = {
  /** The unique identifier stored in the database */
  databaseId: Scalars["Int"]["output"];
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
  /** Whether the node is a Content Node */
  isContentNode: Scalars["Boolean"]["output"];
  /** Whether the node is a Term */
  isTermNode: Scalars["Boolean"]["output"];
  /** The unique resource identifier path */
  uri?: Maybe<Scalars["String"]["output"]>;
};

/** Edge between a Node and a connected MenuItemLinkable */
export type MenuItemLinkableConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected MenuItemLinkable Node */
  node: MenuItemLinkable;
};

/** The Type of Identifier used to fetch a single node. Default is "ID". To be used along with the "id" field. */
export enum MenuItemNodeIdTypeEnum {
  /** Identify a resource by the Database ID. */
  DatabaseId = "DATABASE_ID",
  /** Identify a resource by the (hashed) Global ID. */
  Id = "ID",
}

/** Deprecated in favor of MenuItemLinkeable Interface */
export type MenuItemObjectUnion = Category | Page | Post | Tag;

/** Connection between the MenuItem type and the Menu type */
export type MenuItemToMenuConnectionEdge = Edge &
  MenuConnectionEdge &
  OneToOneConnection & {
    __typename?: "MenuItemToMenuConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: Menu;
  };

/** Connection between the MenuItem type and the MenuItem type */
export type MenuItemToMenuItemConnection = Connection &
  MenuItemConnection & {
    __typename?: "MenuItemToMenuItemConnection";
    /** Edges for the MenuItemToMenuItemConnection connection */
    edges: Array<MenuItemToMenuItemConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<MenuItem>;
    /** Information about pagination in a connection. */
    pageInfo: MenuItemToMenuItemConnectionPageInfo;
  };

/** An edge in a connection */
export type MenuItemToMenuItemConnectionEdge = Edge &
  MenuItemConnectionEdge & {
    __typename?: "MenuItemToMenuItemConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: MenuItem;
  };

/** Page Info on the &quot;MenuItemToMenuItemConnection&quot; */
export type MenuItemToMenuItemConnectionPageInfo = MenuItemConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "MenuItemToMenuItemConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the MenuItemToMenuItemConnection connection */
export type MenuItemToMenuItemConnectionWhereArgs = {
  /** The database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** The menu location for the menu being queried */
  location?: InputMaybe<MenuLocationEnum>;
  /** The database ID of the parent menu object */
  parentDatabaseId?: InputMaybe<Scalars["Int"]["input"]>;
  /** The ID of the parent menu object */
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
};

/** Connection between the MenuItem type and the MenuItemLinkable type */
export type MenuItemToMenuItemLinkableConnectionEdge = Edge &
  MenuItemLinkableConnectionEdge &
  OneToOneConnection & {
    __typename?: "MenuItemToMenuItemLinkableConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: MenuItemLinkable;
  };

/** Registered menu locations */
export enum MenuLocationEnum {
  /** Put the menu in the primary-menu location */
  PrimaryMenu = "PRIMARY_MENU",
}

/** The Type of Identifier used to fetch a single node. Default is "ID". To be used along with the "id" field. */
export enum MenuNodeIdTypeEnum {
  /** Identify a menu node by the Database ID. */
  DatabaseId = "DATABASE_ID",
  /** Identify a menu node by the (hashed) Global ID. */
  Id = "ID",
  /** Identify a menu node by the slug of menu location to which it is assigned */
  Location = "LOCATION",
  /** Identify a menu node by its name */
  Name = "NAME",
  /** Identify a menu node by its slug */
  Slug = "SLUG",
}

/** Connection between the Menu type and the MenuItem type */
export type MenuToMenuItemConnection = Connection &
  MenuItemConnection & {
    __typename?: "MenuToMenuItemConnection";
    /** Edges for the MenuToMenuItemConnection connection */
    edges: Array<MenuToMenuItemConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<MenuItem>;
    /** Information about pagination in a connection. */
    pageInfo: MenuToMenuItemConnectionPageInfo;
  };

/** An edge in a connection */
export type MenuToMenuItemConnectionEdge = Edge &
  MenuItemConnectionEdge & {
    __typename?: "MenuToMenuItemConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: MenuItem;
  };

/** Page Info on the &quot;MenuToMenuItemConnection&quot; */
export type MenuToMenuItemConnectionPageInfo = MenuItemConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "MenuToMenuItemConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the MenuToMenuItemConnection connection */
export type MenuToMenuItemConnectionWhereArgs = {
  /** The database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** The menu location for the menu being queried */
  location?: InputMaybe<MenuLocationEnum>;
  /** The database ID of the parent menu object */
  parentDatabaseId?: InputMaybe<Scalars["Int"]["input"]>;
  /** The ID of the parent menu object */
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
};

/** The MimeType of the object */
export enum MimeTypeEnum {
  /** application/java mime type. */
  ApplicationJava = "APPLICATION_JAVA",
  /** application/msword mime type. */
  ApplicationMsword = "APPLICATION_MSWORD",
  /** application/octet-stream mime type. */
  ApplicationOctetStream = "APPLICATION_OCTET_STREAM",
  /** application/onenote mime type. */
  ApplicationOnenote = "APPLICATION_ONENOTE",
  /** application/oxps mime type. */
  ApplicationOxps = "APPLICATION_OXPS",
  /** application/pdf mime type. */
  ApplicationPdf = "APPLICATION_PDF",
  /** application/rar mime type. */
  ApplicationRar = "APPLICATION_RAR",
  /** application/rtf mime type. */
  ApplicationRtf = "APPLICATION_RTF",
  /** application/ttaf+xml mime type. */
  ApplicationTtafXml = "APPLICATION_TTAF_XML",
  /** application/vnd.apple.keynote mime type. */
  ApplicationVndAppleKeynote = "APPLICATION_VND_APPLE_KEYNOTE",
  /** application/vnd.apple.numbers mime type. */
  ApplicationVndAppleNumbers = "APPLICATION_VND_APPLE_NUMBERS",
  /** application/vnd.apple.pages mime type. */
  ApplicationVndApplePages = "APPLICATION_VND_APPLE_PAGES",
  /** application/vnd.ms-access mime type. */
  ApplicationVndMsAccess = "APPLICATION_VND_MS_ACCESS",
  /** application/vnd.ms-excel mime type. */
  ApplicationVndMsExcel = "APPLICATION_VND_MS_EXCEL",
  /** application/vnd.ms-excel.addin.macroEnabled.12 mime type. */
  ApplicationVndMsExcelAddinMacroenabled_12 = "APPLICATION_VND_MS_EXCEL_ADDIN_MACROENABLED_12",
  /** application/vnd.ms-excel.sheet.binary.macroEnabled.12 mime type. */
  ApplicationVndMsExcelSheetBinaryMacroenabled_12 = "APPLICATION_VND_MS_EXCEL_SHEET_BINARY_MACROENABLED_12",
  /** application/vnd.ms-excel.sheet.macroEnabled.12 mime type. */
  ApplicationVndMsExcelSheetMacroenabled_12 = "APPLICATION_VND_MS_EXCEL_SHEET_MACROENABLED_12",
  /** application/vnd.ms-excel.template.macroEnabled.12 mime type. */
  ApplicationVndMsExcelTemplateMacroenabled_12 = "APPLICATION_VND_MS_EXCEL_TEMPLATE_MACROENABLED_12",
  /** application/vnd.ms-powerpoint mime type. */
  ApplicationVndMsPowerpoint = "APPLICATION_VND_MS_POWERPOINT",
  /** application/vnd.ms-powerpoint.addin.macroEnabled.12 mime type. */
  ApplicationVndMsPowerpointAddinMacroenabled_12 = "APPLICATION_VND_MS_POWERPOINT_ADDIN_MACROENABLED_12",
  /** application/vnd.ms-powerpoint.presentation.macroEnabled.12 mime type. */
  ApplicationVndMsPowerpointPresentationMacroenabled_12 = "APPLICATION_VND_MS_POWERPOINT_PRESENTATION_MACROENABLED_12",
  /** application/vnd.ms-powerpoint.slideshow.macroEnabled.12 mime type. */
  ApplicationVndMsPowerpointSlideshowMacroenabled_12 = "APPLICATION_VND_MS_POWERPOINT_SLIDESHOW_MACROENABLED_12",
  /** application/vnd.ms-powerpoint.slide.macroEnabled.12 mime type. */
  ApplicationVndMsPowerpointSlideMacroenabled_12 = "APPLICATION_VND_MS_POWERPOINT_SLIDE_MACROENABLED_12",
  /** application/vnd.ms-powerpoint.template.macroEnabled.12 mime type. */
  ApplicationVndMsPowerpointTemplateMacroenabled_12 = "APPLICATION_VND_MS_POWERPOINT_TEMPLATE_MACROENABLED_12",
  /** application/vnd.ms-project mime type. */
  ApplicationVndMsProject = "APPLICATION_VND_MS_PROJECT",
  /** application/vnd.ms-word.document.macroEnabled.12 mime type. */
  ApplicationVndMsWordDocumentMacroenabled_12 = "APPLICATION_VND_MS_WORD_DOCUMENT_MACROENABLED_12",
  /** application/vnd.ms-word.template.macroEnabled.12 mime type. */
  ApplicationVndMsWordTemplateMacroenabled_12 = "APPLICATION_VND_MS_WORD_TEMPLATE_MACROENABLED_12",
  /** application/vnd.ms-write mime type. */
  ApplicationVndMsWrite = "APPLICATION_VND_MS_WRITE",
  /** application/vnd.ms-xpsdocument mime type. */
  ApplicationVndMsXpsdocument = "APPLICATION_VND_MS_XPSDOCUMENT",
  /** application/vnd.oasis.opendocument.chart mime type. */
  ApplicationVndOasisOpendocumentChart = "APPLICATION_VND_OASIS_OPENDOCUMENT_CHART",
  /** application/vnd.oasis.opendocument.database mime type. */
  ApplicationVndOasisOpendocumentDatabase = "APPLICATION_VND_OASIS_OPENDOCUMENT_DATABASE",
  /** application/vnd.oasis.opendocument.formula mime type. */
  ApplicationVndOasisOpendocumentFormula = "APPLICATION_VND_OASIS_OPENDOCUMENT_FORMULA",
  /** application/vnd.oasis.opendocument.graphics mime type. */
  ApplicationVndOasisOpendocumentGraphics = "APPLICATION_VND_OASIS_OPENDOCUMENT_GRAPHICS",
  /** application/vnd.oasis.opendocument.presentation mime type. */
  ApplicationVndOasisOpendocumentPresentation = "APPLICATION_VND_OASIS_OPENDOCUMENT_PRESENTATION",
  /** application/vnd.oasis.opendocument.spreadsheet mime type. */
  ApplicationVndOasisOpendocumentSpreadsheet = "APPLICATION_VND_OASIS_OPENDOCUMENT_SPREADSHEET",
  /** application/vnd.oasis.opendocument.text mime type. */
  ApplicationVndOasisOpendocumentText = "APPLICATION_VND_OASIS_OPENDOCUMENT_TEXT",
  /** application/vnd.openxmlformats-officedocument.presentationml.presentation mime type. */
  ApplicationVndOpenxmlformatsOfficedocumentPresentationmlPresentation = "APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_PRESENTATIONML_PRESENTATION",
  /** application/vnd.openxmlformats-officedocument.presentationml.slide mime type. */
  ApplicationVndOpenxmlformatsOfficedocumentPresentationmlSlide = "APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_PRESENTATIONML_SLIDE",
  /** application/vnd.openxmlformats-officedocument.presentationml.slideshow mime type. */
  ApplicationVndOpenxmlformatsOfficedocumentPresentationmlSlideshow = "APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_PRESENTATIONML_SLIDESHOW",
  /** application/vnd.openxmlformats-officedocument.presentationml.template mime type. */
  ApplicationVndOpenxmlformatsOfficedocumentPresentationmlTemplate = "APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_PRESENTATIONML_TEMPLATE",
  /** application/vnd.openxmlformats-officedocument.spreadsheetml.sheet mime type. */
  ApplicationVndOpenxmlformatsOfficedocumentSpreadsheetmlSheet = "APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_SPREADSHEETML_SHEET",
  /** application/vnd.openxmlformats-officedocument.spreadsheetml.template mime type. */
  ApplicationVndOpenxmlformatsOfficedocumentSpreadsheetmlTemplate = "APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_SPREADSHEETML_TEMPLATE",
  /** application/vnd.openxmlformats-officedocument.wordprocessingml.document mime type. */
  ApplicationVndOpenxmlformatsOfficedocumentWordprocessingmlDocument = "APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_WORDPROCESSINGML_DOCUMENT",
  /** application/vnd.openxmlformats-officedocument.wordprocessingml.template mime type. */
  ApplicationVndOpenxmlformatsOfficedocumentWordprocessingmlTemplate = "APPLICATION_VND_OPENXMLFORMATS_OFFICEDOCUMENT_WORDPROCESSINGML_TEMPLATE",
  /** application/wordperfect mime type. */
  ApplicationWordperfect = "APPLICATION_WORDPERFECT",
  /** application/x-7z-compressed mime type. */
  ApplicationX_7ZCompressed = "APPLICATION_X_7Z_COMPRESSED",
  /** application/x-gzip mime type. */
  ApplicationXGzip = "APPLICATION_X_GZIP",
  /** application/x-tar mime type. */
  ApplicationXTar = "APPLICATION_X_TAR",
  /** application/zip mime type. */
  ApplicationZip = "APPLICATION_ZIP",
  /** audio/aac mime type. */
  AudioAac = "AUDIO_AAC",
  /** audio/flac mime type. */
  AudioFlac = "AUDIO_FLAC",
  /** audio/midi mime type. */
  AudioMidi = "AUDIO_MIDI",
  /** audio/mpeg mime type. */
  AudioMpeg = "AUDIO_MPEG",
  /** audio/ogg mime type. */
  AudioOgg = "AUDIO_OGG",
  /** audio/wav mime type. */
  AudioWav = "AUDIO_WAV",
  /** audio/x-matroska mime type. */
  AudioXMatroska = "AUDIO_X_MATROSKA",
  /** audio/x-ms-wax mime type. */
  AudioXMsWax = "AUDIO_X_MS_WAX",
  /** audio/x-ms-wma mime type. */
  AudioXMsWma = "AUDIO_X_MS_WMA",
  /** audio/x-realaudio mime type. */
  AudioXRealaudio = "AUDIO_X_REALAUDIO",
  /** image/bmp mime type. */
  ImageBmp = "IMAGE_BMP",
  /** image/gif mime type. */
  ImageGif = "IMAGE_GIF",
  /** image/heic mime type. */
  ImageHeic = "IMAGE_HEIC",
  /** image/jpeg mime type. */
  ImageJpeg = "IMAGE_JPEG",
  /** image/png mime type. */
  ImagePng = "IMAGE_PNG",
  /** image/tiff mime type. */
  ImageTiff = "IMAGE_TIFF",
  /** image/webp mime type. */
  ImageWebp = "IMAGE_WEBP",
  /** image/x-icon mime type. */
  ImageXIcon = "IMAGE_X_ICON",
  /** text/calendar mime type. */
  TextCalendar = "TEXT_CALENDAR",
  /** text/css mime type. */
  TextCss = "TEXT_CSS",
  /** text/csv mime type. */
  TextCsv = "TEXT_CSV",
  /** text/plain mime type. */
  TextPlain = "TEXT_PLAIN",
  /** text/richtext mime type. */
  TextRichtext = "TEXT_RICHTEXT",
  /** text/tab-separated-values mime type. */
  TextTabSeparatedValues = "TEXT_TAB_SEPARATED_VALUES",
  /** text/vtt mime type. */
  TextVtt = "TEXT_VTT",
  /** video/3gpp mime type. */
  Video_3Gpp = "VIDEO_3GPP",
  /** video/3gpp2 mime type. */
  Video_3Gpp2 = "VIDEO_3GPP2",
  /** video/avi mime type. */
  VideoAvi = "VIDEO_AVI",
  /** video/divx mime type. */
  VideoDivx = "VIDEO_DIVX",
  /** video/mp4 mime type. */
  VideoMp4 = "VIDEO_MP4",
  /** video/mpeg mime type. */
  VideoMpeg = "VIDEO_MPEG",
  /** video/ogg mime type. */
  VideoOgg = "VIDEO_OGG",
  /** video/quicktime mime type. */
  VideoQuicktime = "VIDEO_QUICKTIME",
  /** video/webm mime type. */
  VideoWebm = "VIDEO_WEBM",
  /** video/x-flv mime type. */
  VideoXFlv = "VIDEO_X_FLV",
  /** video/x-matroska mime type. */
  VideoXMatroska = "VIDEO_X_MATROSKA",
  /** video/x-ms-asf mime type. */
  VideoXMsAsf = "VIDEO_X_MS_ASF",
  /** video/x-ms-wm mime type. */
  VideoXMsWm = "VIDEO_X_MS_WM",
  /** video/x-ms-wmv mime type. */
  VideoXMsWmv = "VIDEO_X_MS_WMV",
  /** video/x-ms-wmx mime type. */
  VideoXMsWmx = "VIDEO_X_MS_WMX",
}

/** An object with an ID */
export type Node = {
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
};

/** A node that can have an author assigned to it */
export type NodeWithAuthor = {
  /** Connection between the NodeWithAuthor type and the User type */
  author?: Maybe<NodeWithAuthorToUserConnectionEdge>;
  /** The database identifier of the author of the node */
  authorDatabaseId?: Maybe<Scalars["Int"]["output"]>;
  /** The globally unique identifier of the author of the node */
  authorId?: Maybe<Scalars["ID"]["output"]>;
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
};

/** Connection between the NodeWithAuthor type and the User type */
export type NodeWithAuthorToUserConnectionEdge = Edge &
  OneToOneConnection &
  UserConnectionEdge & {
    __typename?: "NodeWithAuthorToUserConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: User;
  };

/** A node that can have comments associated with it */
export type NodeWithComments = {
  /** The number of comments. Even though WPGraphQL denotes this field as an integer, in WordPress this field should be saved as a numeric string for compatibility. */
  commentCount?: Maybe<Scalars["Int"]["output"]>;
  /** Whether the comments are open or closed for this particular post. */
  commentStatus?: Maybe<Scalars["String"]["output"]>;
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
};

/** A node that supports the content editor */
export type NodeWithContentEditor = {
  /** The content of the post. */
  content?: Maybe<Scalars["String"]["output"]>;
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
};

/** A node that supports the content editor */
export type NodeWithContentEditorContentArgs = {
  format?: InputMaybe<PostObjectFieldFormatEnum>;
};

/** A node that can have an excerpt */
export type NodeWithExcerpt = {
  /** The excerpt of the post. */
  excerpt?: Maybe<Scalars["String"]["output"]>;
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
};

/** A node that can have an excerpt */
export type NodeWithExcerptExcerptArgs = {
  format?: InputMaybe<PostObjectFieldFormatEnum>;
};

/** A node that can have a featured image set */
export type NodeWithFeaturedImage = {
  /** Connection between the NodeWithFeaturedImage type and the MediaItem type */
  featuredImage?: Maybe<NodeWithFeaturedImageToMediaItemConnectionEdge>;
  /** The database identifier for the featured image node assigned to the content node */
  featuredImageDatabaseId?: Maybe<Scalars["Int"]["output"]>;
  /** Globally unique ID of the featured image assigned to the node */
  featuredImageId?: Maybe<Scalars["ID"]["output"]>;
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
};

/** Connection between the NodeWithFeaturedImage type and the MediaItem type */
export type NodeWithFeaturedImageToMediaItemConnectionEdge = Edge &
  MediaItemConnectionEdge &
  OneToOneConnection & {
    __typename?: "NodeWithFeaturedImageToMediaItemConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: MediaItem;
  };

/** A node that can have page attributes */
export type NodeWithPageAttributes = {
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
  /** A field used for ordering posts. This is typically used with nav menu items or for special ordering of hierarchical content types. */
  menuOrder?: Maybe<Scalars["Int"]["output"]>;
};

/** A node that can have revisions */
export type NodeWithRevisions = {
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
  /** True if the node is a revision of another node */
  isRevision?: Maybe<Scalars["Boolean"]["output"]>;
  /** If the current node is a revision, this field exposes the node this is a revision of. Returns null if the node is not a revision of another node. */
  revisionOf?: Maybe<NodeWithRevisionsToContentNodeConnectionEdge>;
};

/** Connection between the NodeWithRevisions type and the ContentNode type */
export type NodeWithRevisionsToContentNodeConnectionEdge =
  ContentNodeConnectionEdge &
    Edge &
    OneToOneConnection & {
      __typename?: "NodeWithRevisionsToContentNodeConnectionEdge";
      /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
      cursor?: Maybe<Scalars["String"]["output"]>;
      /** The node of the connection, without the edges */
      node: ContentNode;
    };

/** A node that can have a template associated with it */
export type NodeWithTemplate = {
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
  /** The template assigned to the node */
  template?: Maybe<ContentTemplate>;
};

/** A node that NodeWith a title */
export type NodeWithTitle = {
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
  /** The Yoast SEO data of the ContentNode */
  seo?: Maybe<PostTypeSeo>;
  /** The title of the post. This is currently just the raw title. An amendment to support rendered title needs to be made. */
  title?: Maybe<Scalars["String"]["output"]>;
};

/** A node that NodeWith a title */
export type NodeWithTitleTitleArgs = {
  format?: InputMaybe<PostObjectFieldFormatEnum>;
};

/** A node that can have trackbacks and pingbacks */
export type NodeWithTrackbacks = {
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
  /** Whether the pings are open or closed for this particular post. */
  pingStatus?: Maybe<Scalars["String"]["output"]>;
  /** URLs that have been pinged. */
  pinged?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
  /** URLs queued to be pinged. */
  toPing?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
};

/** A singular connection from one Node to another, with support for relational data on the &quot;edge&quot; of the connection. */
export type OneToOneConnection = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected node */
  node: Node;
};

/** The cardinality of the connection order */
export enum OrderEnum {
  /** Sort the query result set in an ascending order */
  Asc = "ASC",
  /** Sort the query result set in a descending order */
  Desc = "DESC",
}

/** The page type */
export type Page = ContentNode &
  DatabaseIdentifier &
  HierarchicalContentNode &
  HierarchicalNode &
  MenuItemLinkable &
  Node &
  NodeWithAuthor &
  NodeWithComments &
  NodeWithContentEditor &
  NodeWithFeaturedImage &
  NodeWithPageAttributes &
  NodeWithRevisions &
  NodeWithTemplate &
  NodeWithTitle &
  Previewable &
  UniformResourceIdentifiable & {
    __typename?: "Page";
    /** Returns ancestors of the node. Default ordered as lowest (closest to the child) to highest (closest to the root). */
    ancestors?: Maybe<HierarchicalContentNodeToContentNodeAncestorsConnection>;
    /** Connection between the NodeWithAuthor type and the User type */
    author?: Maybe<NodeWithAuthorToUserConnectionEdge>;
    /** The database identifier of the author of the node */
    authorDatabaseId?: Maybe<Scalars["Int"]["output"]>;
    /** The globally unique identifier of the author of the node */
    authorId?: Maybe<Scalars["ID"]["output"]>;
    /** Connection between the HierarchicalContentNode type and the ContentNode type */
    children?: Maybe<HierarchicalContentNodeToContentNodeChildrenConnection>;
    /** The number of comments. Even though WPGraphQL denotes this field as an integer, in WordPress this field should be saved as a numeric string for compatibility. */
    commentCount?: Maybe<Scalars["Int"]["output"]>;
    /** Whether the comments are open or closed for this particular post. */
    commentStatus?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the Page type and the Comment type */
    comments?: Maybe<PageToCommentConnection>;
    /** The content of the post. */
    content?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the ContentNode type and the ContentType type */
    contentType?: Maybe<ContentNodeToContentTypeConnectionEdge>;
    /** The name of the Content Type the node belongs to */
    contentTypeName: Scalars["String"]["output"];
    /** The unique identifier stored in the database */
    databaseId: Scalars["Int"]["output"];
    /** Post publishing date. */
    date?: Maybe<Scalars["String"]["output"]>;
    /** The publishing date set in GMT. */
    dateGmt?: Maybe<Scalars["String"]["output"]>;
    /** The desired slug of the post */
    desiredSlug?: Maybe<Scalars["String"]["output"]>;
    /** If a user has edited the node within the past 15 seconds, this will return the user that last edited. Null if the edit lock doesn&#039;t exist or is greater than 15 seconds */
    editingLockedBy?: Maybe<ContentNodeToEditLockConnectionEdge>;
    /** The RSS enclosure for the object */
    enclosure?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the ContentNode type and the EnqueuedScript type */
    enqueuedScripts?: Maybe<ContentNodeToEnqueuedScriptConnection>;
    /** Connection between the ContentNode type and the EnqueuedStylesheet type */
    enqueuedStylesheets?: Maybe<ContentNodeToEnqueuedStylesheetConnection>;
    /** Connection between the NodeWithFeaturedImage type and the MediaItem type */
    featuredImage?: Maybe<NodeWithFeaturedImageToMediaItemConnectionEdge>;
    /** The database identifier for the featured image node assigned to the content node */
    featuredImageDatabaseId?: Maybe<Scalars["Int"]["output"]>;
    /** Globally unique ID of the featured image assigned to the node */
    featuredImageId?: Maybe<Scalars["ID"]["output"]>;
    /** The global unique identifier for this post. This currently matches the value stored in WP_Post-&gt;guid and the guid column in the &quot;post_objects&quot; database table. */
    guid?: Maybe<Scalars["String"]["output"]>;
    /** The globally unique identifier of the page object. */
    id: Scalars["ID"]["output"];
    /** Whether the node is a Content Node */
    isContentNode: Scalars["Boolean"]["output"];
    /** Whether this page is set to the static front page. */
    isFrontPage: Scalars["Boolean"]["output"];
    /** Whether this page is set to the blog posts page. */
    isPostsPage: Scalars["Boolean"]["output"];
    /** Whether the object is a node in the preview state */
    isPreview?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether this page is set to the privacy page. */
    isPrivacyPage: Scalars["Boolean"]["output"];
    /** Whether the object is restricted from the current viewer */
    isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
    /** True if the node is a revision of another node */
    isRevision?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether the node is a Term */
    isTermNode: Scalars["Boolean"]["output"];
    /** The user that most recently edited the node */
    lastEditedBy?: Maybe<ContentNodeToEditLastConnectionEdge>;
    /** The permalink of the post */
    link?: Maybe<Scalars["String"]["output"]>;
    /** A field used for ordering posts. This is typically used with nav menu items or for special ordering of hierarchical content types. */
    menuOrder?: Maybe<Scalars["Int"]["output"]>;
    /** The local modified time for a post. If a post was recently updated the modified field will change to match the corresponding time. */
    modified?: Maybe<Scalars["String"]["output"]>;
    /** The GMT modified time for a post. If a post was recently updated the modified field will change to match the corresponding time in GMT. */
    modifiedGmt?: Maybe<Scalars["String"]["output"]>;
    /**
     * The id field matches the WP_Post-&gt;ID field.
     * @deprecated Deprecated in favor of the databaseId field
     */
    pageId: Scalars["Int"]["output"];
    /** The parent of the node. The parent object can be of various types */
    parent?: Maybe<HierarchicalContentNodeToParentContentNodeConnectionEdge>;
    /** Database id of the parent node */
    parentDatabaseId?: Maybe<Scalars["Int"]["output"]>;
    /** The globally unique identifier of the parent node. */
    parentId?: Maybe<Scalars["ID"]["output"]>;
    /** Connection between the Page type and the page type */
    preview?: Maybe<PageToPreviewConnectionEdge>;
    /** The database id of the preview node */
    previewRevisionDatabaseId?: Maybe<Scalars["Int"]["output"]>;
    /** Whether the object is a node in the preview state */
    previewRevisionId?: Maybe<Scalars["ID"]["output"]>;
    /** If the current node is a revision, this field exposes the node this is a revision of. Returns null if the node is not a revision of another node. */
    revisionOf?: Maybe<NodeWithRevisionsToContentNodeConnectionEdge>;
    /** Connection between the Page type and the page type */
    revisions?: Maybe<PageToRevisionConnection>;
    /** The Yoast SEO data of the ContentNode */
    seo?: Maybe<PostTypeSeo>;
    /** The uri slug for the post. This is equivalent to the WP_Post-&gt;post_name field and the post_name column in the database for the &quot;post_objects&quot; table. */
    slug?: Maybe<Scalars["String"]["output"]>;
    /** The current status of the object */
    status?: Maybe<Scalars["String"]["output"]>;
    /** The template assigned to a node of content */
    template?: Maybe<ContentTemplate>;
    /** The title of the post. This is currently just the raw title. An amendment to support rendered title needs to be made. */
    title?: Maybe<Scalars["String"]["output"]>;
    /** The unique resource identifier path */
    uri?: Maybe<Scalars["String"]["output"]>;
  };

/** The page type */
export type PageAncestorsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<HierarchicalContentNodeToContentNodeAncestorsConnectionWhereArgs>;
};

/** The page type */
export type PageChildrenArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<HierarchicalContentNodeToContentNodeChildrenConnectionWhereArgs>;
};

/** The page type */
export type PageCommentsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PageToCommentConnectionWhereArgs>;
};

/** The page type */
export type PageContentArgs = {
  format?: InputMaybe<PostObjectFieldFormatEnum>;
};

/** The page type */
export type PageEnqueuedScriptsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The page type */
export type PageEnqueuedStylesheetsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The page type */
export type PageRevisionsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PageToRevisionConnectionWhereArgs>;
};

/** The page type */
export type PageTitleArgs = {
  format?: InputMaybe<PostObjectFieldFormatEnum>;
};

/** Connection to page Nodes */
export type PageConnection = {
  /** A list of edges (relational context) between RootQuery and connected page Nodes */
  edges: Array<PageConnectionEdge>;
  /** A list of connected page Nodes */
  nodes: Array<Page>;
  /** Information about pagination in a connection. */
  pageInfo: PageConnectionPageInfo;
};

/** Edge between a Node and a connected page */
export type PageConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected page Node */
  node: Page;
};

/** Page Info on the connected PageConnectionEdge */
export type PageConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** The Type of Identifier used to fetch a single resource. Default is ID. */
export enum PageIdType {
  /** Identify a resource by the Database ID. */
  DatabaseId = "DATABASE_ID",
  /** Identify a resource by the (hashed) Global ID. */
  Id = "ID",
  /** Identify a resource by the URI. */
  Uri = "URI",
}

/** Information about pagination in a connection. */
export type PageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** Connection between the Page type and the Comment type */
export type PageToCommentConnection = CommentConnection &
  Connection & {
    __typename?: "PageToCommentConnection";
    /** Edges for the PageToCommentConnection connection */
    edges: Array<PageToCommentConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Comment>;
    /** Information about pagination in a connection. */
    pageInfo: PageToCommentConnectionPageInfo;
  };

/** An edge in a connection */
export type PageToCommentConnectionEdge = CommentConnectionEdge &
  Edge & {
    __typename?: "PageToCommentConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Comment;
  };

/** Page Info on the &quot;PageToCommentConnection&quot; */
export type PageToCommentConnectionPageInfo = CommentConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "PageToCommentConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the PageToCommentConnection connection */
export type PageToCommentConnectionWhereArgs = {
  /** Comment author email address. */
  authorEmail?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of author IDs to include comments for. */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to exclude comments for. */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Comment author URL. */
  authorUrl?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of comment IDs to include. */
  commentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of IDs of users whose unapproved comments will be returned by the query regardless of status. */
  commentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Include comments of a given type. */
  commentType?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments from a given array of comment types. */
  commentTypeIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Exclude comments from a given array of comment types. */
  commentTypeNotIn?: InputMaybe<Scalars["String"]["input"]>;
  /** Content object author ID to limit results by. */
  contentAuthor?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to retrieve comments for. */
  contentAuthorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs *not* to retrieve comments for. */
  contentAuthorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Limit results to those affiliated with a given content object ID. */
  contentId?: InputMaybe<Scalars["ID"]["input"]>;
  /** Array of content object IDs to include affiliated comments for. */
  contentIdIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of content object IDs to exclude affiliated comments for. */
  contentIdNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Content object name (i.e. slug ) to retrieve affiliated comments for. */
  contentName?: InputMaybe<Scalars["String"]["input"]>;
  /** Content Object parent ID to retrieve affiliated comments for. */
  contentParent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of content object statuses to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentStatus?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Content object type or array of types to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentType?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Array of IDs or email addresses of users whose unapproved comments will be returned by the query regardless of $status. Default empty */
  includeUnapproved?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Karma score to retrieve matching comments for. */
  karma?: InputMaybe<Scalars["Int"]["input"]>;
  /** The cardinality of the order of the connection */
  order?: InputMaybe<OrderEnum>;
  /** Field to order the comments by. */
  orderby?: InputMaybe<CommentsConnectionOrderbyEnum>;
  /** Parent ID of comment to retrieve children of. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of parent IDs of comments to retrieve children for. */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of parent IDs of comments *not* to retrieve children for. */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Search term(s) to retrieve matching comments for. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Comment status to limit results by. */
  status?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments for a specific user ID. */
  userId?: InputMaybe<Scalars["ID"]["input"]>;
};

/** Connection between the Page type and the page type */
export type PageToPreviewConnectionEdge = Edge &
  OneToOneConnection &
  PageConnectionEdge & {
    __typename?: "PageToPreviewConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: Page;
  };

/** Connection between the Page type and the page type */
export type PageToRevisionConnection = Connection &
  PageConnection & {
    __typename?: "PageToRevisionConnection";
    /** Edges for the PageToRevisionConnection connection */
    edges: Array<PageToRevisionConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Page>;
    /** Information about pagination in a connection. */
    pageInfo: PageToRevisionConnectionPageInfo;
  };

/** An edge in a connection */
export type PageToRevisionConnectionEdge = Edge &
  PageConnectionEdge & {
    __typename?: "PageToRevisionConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Page;
  };

/** Page Info on the &quot;PageToRevisionConnection&quot; */
export type PageToRevisionConnectionPageInfo = PageConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "PageToRevisionConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the PageToRevisionConnection connection */
export type PageToRevisionConnectionWhereArgs = {
  /** The user that's connected as the author of the object. Use the userId for the author object. */
  author?: InputMaybe<Scalars["Int"]["input"]>;
  /** Find objects connected to author(s) in the array of author's userIds */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Find objects connected to the author by the author's nicename */
  authorName?: InputMaybe<Scalars["String"]["input"]>;
  /** Find objects NOT connected to author(s) in the array of author's userIds */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** An plugin object */
export type Plugin = Node & {
  __typename?: "Plugin";
  /** Name of the plugin author(s), may also be a company name. */
  author?: Maybe<Scalars["String"]["output"]>;
  /** URI for the related author(s)/company website. */
  authorUri?: Maybe<Scalars["String"]["output"]>;
  /** Description of the plugin. */
  description?: Maybe<Scalars["String"]["output"]>;
  /** The globally unique identifier of the plugin object. */
  id: Scalars["ID"]["output"];
  /** Whether the object is restricted from the current viewer */
  isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
  /** Display name of the plugin. */
  name?: Maybe<Scalars["String"]["output"]>;
  /** Plugin path. */
  path?: Maybe<Scalars["String"]["output"]>;
  /** URI for the plugin website. This is useful for directing users for support requests etc. */
  pluginUri?: Maybe<Scalars["String"]["output"]>;
  /** Current version of the plugin. */
  version?: Maybe<Scalars["String"]["output"]>;
};

/** Connection to Plugin Nodes */
export type PluginConnection = {
  /** A list of edges (relational context) between RootQuery and connected Plugin Nodes */
  edges: Array<PluginConnectionEdge>;
  /** A list of connected Plugin Nodes */
  nodes: Array<Plugin>;
  /** Information about pagination in a connection. */
  pageInfo: PluginConnectionPageInfo;
};

/** Edge between a Node and a connected Plugin */
export type PluginConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected Plugin Node */
  node: Plugin;
};

/** Page Info on the connected PluginConnectionEdge */
export type PluginConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** The status of the WordPress plugin. */
export enum PluginStatusEnum {
  /** The plugin is currently active. */
  Active = "ACTIVE",
  /** The plugin is a drop-in plugin. */
  DropIn = "DROP_IN",
  /** The plugin is currently inactive. */
  Inactive = "INACTIVE",
  /** The plugin is a must-use plugin. */
  MustUse = "MUST_USE",
  /** The plugin is technically active but was paused while loading. */
  Paused = "PAUSED",
  /** The plugin was active recently. */
  RecentlyActive = "RECENTLY_ACTIVE",
  /** The plugin has an upgrade available. */
  Upgrade = "UPGRADE",
}

/** The post type */
export type Post = ContentNode &
  DatabaseIdentifier &
  MenuItemLinkable &
  Node &
  NodeWithAuthor &
  NodeWithComments &
  NodeWithContentEditor &
  NodeWithExcerpt &
  NodeWithFeaturedImage &
  NodeWithRevisions &
  NodeWithTemplate &
  NodeWithTitle &
  NodeWithTrackbacks &
  Previewable &
  UniformResourceIdentifiable & {
    __typename?: "Post";
    /** Connection between the NodeWithAuthor type and the User type */
    author?: Maybe<NodeWithAuthorToUserConnectionEdge>;
    /** The database identifier of the author of the node */
    authorDatabaseId?: Maybe<Scalars["Int"]["output"]>;
    /** The globally unique identifier of the author of the node */
    authorId?: Maybe<Scalars["ID"]["output"]>;
    /** Connection between the Post type and the category type */
    categories?: Maybe<PostToCategoryConnection>;
    /** The number of comments. Even though WPGraphQL denotes this field as an integer, in WordPress this field should be saved as a numeric string for compatibility. */
    commentCount?: Maybe<Scalars["Int"]["output"]>;
    /** Whether the comments are open or closed for this particular post. */
    commentStatus?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the Post type and the Comment type */
    comments?: Maybe<PostToCommentConnection>;
    /** The content of the post. */
    content?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the ContentNode type and the ContentType type */
    contentType?: Maybe<ContentNodeToContentTypeConnectionEdge>;
    /** The name of the Content Type the node belongs to */
    contentTypeName: Scalars["String"]["output"];
    /** The unique identifier stored in the database */
    databaseId: Scalars["Int"]["output"];
    /** Post publishing date. */
    date?: Maybe<Scalars["String"]["output"]>;
    /** The publishing date set in GMT. */
    dateGmt?: Maybe<Scalars["String"]["output"]>;
    /** The desired slug of the post */
    desiredSlug?: Maybe<Scalars["String"]["output"]>;
    /** If a user has edited the node within the past 15 seconds, this will return the user that last edited. Null if the edit lock doesn&#039;t exist or is greater than 15 seconds */
    editingLockedBy?: Maybe<ContentNodeToEditLockConnectionEdge>;
    /** The RSS enclosure for the object */
    enclosure?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the ContentNode type and the EnqueuedScript type */
    enqueuedScripts?: Maybe<ContentNodeToEnqueuedScriptConnection>;
    /** Connection between the ContentNode type and the EnqueuedStylesheet type */
    enqueuedStylesheets?: Maybe<ContentNodeToEnqueuedStylesheetConnection>;
    /** The excerpt of the post. */
    excerpt?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the NodeWithFeaturedImage type and the MediaItem type */
    featuredImage?: Maybe<NodeWithFeaturedImageToMediaItemConnectionEdge>;
    /** The database identifier for the featured image node assigned to the content node */
    featuredImageDatabaseId?: Maybe<Scalars["Int"]["output"]>;
    /** Globally unique ID of the featured image assigned to the node */
    featuredImageId?: Maybe<Scalars["ID"]["output"]>;
    /** The global unique identifier for this post. This currently matches the value stored in WP_Post-&gt;guid and the guid column in the &quot;post_objects&quot; database table. */
    guid?: Maybe<Scalars["String"]["output"]>;
    /** The globally unique identifier of the post object. */
    id: Scalars["ID"]["output"];
    /** Whether the node is a Content Node */
    isContentNode: Scalars["Boolean"]["output"];
    /** Whether the object is a node in the preview state */
    isPreview?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether the object is restricted from the current viewer */
    isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
    /** True if the node is a revision of another node */
    isRevision?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether this page is sticky */
    isSticky: Scalars["Boolean"]["output"];
    /** Whether the node is a Term */
    isTermNode: Scalars["Boolean"]["output"];
    /** The user that most recently edited the node */
    lastEditedBy?: Maybe<ContentNodeToEditLastConnectionEdge>;
    /** The permalink of the post */
    link?: Maybe<Scalars["String"]["output"]>;
    /** The local modified time for a post. If a post was recently updated the modified field will change to match the corresponding time. */
    modified?: Maybe<Scalars["String"]["output"]>;
    /** The GMT modified time for a post. If a post was recently updated the modified field will change to match the corresponding time in GMT. */
    modifiedGmt?: Maybe<Scalars["String"]["output"]>;
    /** Whether the pings are open or closed for this particular post. */
    pingStatus?: Maybe<Scalars["String"]["output"]>;
    /** URLs that have been pinged. */
    pinged?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
    /** Connection between the Post type and the postFormat type */
    postFormats?: Maybe<PostToPostFormatConnection>;
    /**
     * The id field matches the WP_Post-&gt;ID field.
     * @deprecated Deprecated in favor of the databaseId field
     */
    postId: Scalars["Int"]["output"];
    /** Connection between the Post type and the post type */
    preview?: Maybe<PostToPreviewConnectionEdge>;
    /** The database id of the preview node */
    previewRevisionDatabaseId?: Maybe<Scalars["Int"]["output"]>;
    /** Whether the object is a node in the preview state */
    previewRevisionId?: Maybe<Scalars["ID"]["output"]>;
    /** If the current node is a revision, this field exposes the node this is a revision of. Returns null if the node is not a revision of another node. */
    revisionOf?: Maybe<NodeWithRevisionsToContentNodeConnectionEdge>;
    /** Connection between the Post type and the post type */
    revisions?: Maybe<PostToRevisionConnection>;
    /** The Yoast SEO data of the ContentNode */
    seo?: Maybe<PostTypeSeo>;
    /** The uri slug for the post. This is equivalent to the WP_Post-&gt;post_name field and the post_name column in the database for the &quot;post_objects&quot; table. */
    slug?: Maybe<Scalars["String"]["output"]>;
    /** The current status of the object */
    status?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the Post type and the tag type */
    tags?: Maybe<PostToTagConnection>;
    /** The template assigned to the node */
    template?: Maybe<ContentTemplate>;
    /** Connection between the Post type and the TermNode type */
    terms?: Maybe<PostToTermNodeConnection>;
    /** The title of the post. This is currently just the raw title. An amendment to support rendered title needs to be made. */
    title?: Maybe<Scalars["String"]["output"]>;
    /** URLs queued to be pinged. */
    toPing?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
    /** The unique resource identifier path */
    uri?: Maybe<Scalars["String"]["output"]>;
  };

/** The post type */
export type PostCategoriesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PostToCategoryConnectionWhereArgs>;
};

/** The post type */
export type PostCommentsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PostToCommentConnectionWhereArgs>;
};

/** The post type */
export type PostContentArgs = {
  format?: InputMaybe<PostObjectFieldFormatEnum>;
};

/** The post type */
export type PostEnqueuedScriptsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The post type */
export type PostEnqueuedStylesheetsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The post type */
export type PostExcerptArgs = {
  format?: InputMaybe<PostObjectFieldFormatEnum>;
};

/** The post type */
export type PostPostFormatsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PostToPostFormatConnectionWhereArgs>;
};

/** The post type */
export type PostRevisionsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PostToRevisionConnectionWhereArgs>;
};

/** The post type */
export type PostTagsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PostToTagConnectionWhereArgs>;
};

/** The post type */
export type PostTermsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PostToTermNodeConnectionWhereArgs>;
};

/** The post type */
export type PostTitleArgs = {
  format?: InputMaybe<PostObjectFieldFormatEnum>;
};

/** Set relationships between the post to categories */
export type PostCategoriesInput = {
  /** If true, this will append the category to existing related categories. If false, this will replace existing relationships. Default true. */
  append?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** The input list of items to set. */
  nodes?: InputMaybe<Array<InputMaybe<PostCategoriesNodeInput>>>;
};

/** List of categories to connect the post to. If an ID is set, it will be used to create the connection. If not, it will look for a slug. If neither are valid existing terms, and the site is configured to allow terms to be created during post mutations, a term will be created using the Name if it exists in the input, then fallback to the slug if it exists. */
export type PostCategoriesNodeInput = {
  /** The description of the category. This field is used to set a description of the category if a new one is created during the mutation. */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the category. If present, this will be used to connect to the post. If no existing category exists with this ID, no connection will be made. */
  id?: InputMaybe<Scalars["ID"]["input"]>;
  /** The name of the category. This field is used to create a new term, if term creation is enabled in nested mutations, and if one does not already exist with the provided slug or ID or if a slug or ID is not provided. If no name is included and a term is created, the creation will fallback to the slug field. */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** The slug of the category. If no ID is present, this field will be used to make a connection. If no existing term exists with this slug, this field will be used as a fallback to the Name field when creating a new term to connect to, if term creation is enabled as a nested mutation. */
  slug?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection to post Nodes */
export type PostConnection = {
  /** A list of edges (relational context) between RootQuery and connected post Nodes */
  edges: Array<PostConnectionEdge>;
  /** A list of connected post Nodes */
  nodes: Array<Post>;
  /** Information about pagination in a connection. */
  pageInfo: PostConnectionPageInfo;
};

/** Edge between a Node and a connected post */
export type PostConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected post Node */
  node: Post;
};

/** Page Info on the connected PostConnectionEdge */
export type PostConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** The postFormat type */
export type PostFormat = DatabaseIdentifier &
  Node &
  TermNode &
  UniformResourceIdentifiable & {
    __typename?: "PostFormat";
    /** Connection between the PostFormat type and the ContentNode type */
    contentNodes?: Maybe<PostFormatToContentNodeConnection>;
    /** The number of objects connected to the object */
    count?: Maybe<Scalars["Int"]["output"]>;
    /** The unique identifier stored in the database */
    databaseId: Scalars["Int"]["output"];
    /** The description of the object */
    description?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the TermNode type and the EnqueuedScript type */
    enqueuedScripts?: Maybe<TermNodeToEnqueuedScriptConnection>;
    /** Connection between the TermNode type and the EnqueuedStylesheet type */
    enqueuedStylesheets?: Maybe<TermNodeToEnqueuedStylesheetConnection>;
    /** The globally unique ID for the object */
    id: Scalars["ID"]["output"];
    /** Whether the node is a Content Node */
    isContentNode: Scalars["Boolean"]["output"];
    /** Whether the object is restricted from the current viewer */
    isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether the node is a Term */
    isTermNode: Scalars["Boolean"]["output"];
    /** The link to the term */
    link?: Maybe<Scalars["String"]["output"]>;
    /** The human friendly name of the object. */
    name?: Maybe<Scalars["String"]["output"]>;
    /**
     * The id field matches the WP_Post-&gt;ID field.
     * @deprecated Deprecated in favor of databaseId
     */
    postFormatId?: Maybe<Scalars["Int"]["output"]>;
    /** Connection between the PostFormat type and the post type */
    posts?: Maybe<PostFormatToPostConnection>;
    /** The Yoast SEO data of the Formats taxonomy. */
    seo?: Maybe<TaxonomySeo>;
    /** An alphanumeric identifier for the object unique to its type. */
    slug?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the PostFormat type and the Taxonomy type */
    taxonomy?: Maybe<PostFormatToTaxonomyConnectionEdge>;
    /** The name of the taxonomy that the object is associated with */
    taxonomyName?: Maybe<Scalars["String"]["output"]>;
    /** The ID of the term group that this term object belongs to */
    termGroupId?: Maybe<Scalars["Int"]["output"]>;
    /** The taxonomy ID that the object is associated with */
    termTaxonomyId?: Maybe<Scalars["Int"]["output"]>;
    /** The unique resource identifier path */
    uri?: Maybe<Scalars["String"]["output"]>;
  };

/** The postFormat type */
export type PostFormatContentNodesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PostFormatToContentNodeConnectionWhereArgs>;
};

/** The postFormat type */
export type PostFormatEnqueuedScriptsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The postFormat type */
export type PostFormatEnqueuedStylesheetsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The postFormat type */
export type PostFormatPostsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<PostFormatToPostConnectionWhereArgs>;
};

/** Connection to postFormat Nodes */
export type PostFormatConnection = {
  /** A list of edges (relational context) between RootQuery and connected postFormat Nodes */
  edges: Array<PostFormatConnectionEdge>;
  /** A list of connected postFormat Nodes */
  nodes: Array<PostFormat>;
  /** Information about pagination in a connection. */
  pageInfo: PostFormatConnectionPageInfo;
};

/** Edge between a Node and a connected postFormat */
export type PostFormatConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected postFormat Node */
  node: PostFormat;
};

/** Page Info on the connected PostFormatConnectionEdge */
export type PostFormatConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** The Type of Identifier used to fetch a single resource. Default is ID. */
export enum PostFormatIdType {
  /** The Database ID for the node */
  DatabaseId = "DATABASE_ID",
  /** The hashed Global ID */
  Id = "ID",
  /** The name of the node */
  Name = "NAME",
  /** Url friendly name of the node */
  Slug = "SLUG",
  /** The URI for the node */
  Uri = "URI",
}

/** Connection between the PostFormat type and the ContentNode type */
export type PostFormatToContentNodeConnection = Connection &
  ContentNodeConnection & {
    __typename?: "PostFormatToContentNodeConnection";
    /** Edges for the PostFormatToContentNodeConnection connection */
    edges: Array<PostFormatToContentNodeConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<ContentNode>;
    /** Information about pagination in a connection. */
    pageInfo: PostFormatToContentNodeConnectionPageInfo;
  };

/** An edge in a connection */
export type PostFormatToContentNodeConnectionEdge = ContentNodeConnectionEdge &
  Edge & {
    __typename?: "PostFormatToContentNodeConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: ContentNode;
  };

/** Page Info on the &quot;PostFormatToContentNodeConnection&quot; */
export type PostFormatToContentNodeConnectionPageInfo =
  ContentNodeConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "PostFormatToContentNodeConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Arguments for filtering the PostFormatToContentNodeConnection connection */
export type PostFormatToContentNodeConnectionWhereArgs = {
  /** The Types of content to filter */
  contentTypes?: InputMaybe<Array<InputMaybe<ContentTypesOfPostFormatEnum>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the PostFormat type and the post type */
export type PostFormatToPostConnection = Connection &
  PostConnection & {
    __typename?: "PostFormatToPostConnection";
    /** Edges for the PostFormatToPostConnection connection */
    edges: Array<PostFormatToPostConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Post>;
    /** Information about pagination in a connection. */
    pageInfo: PostFormatToPostConnectionPageInfo;
  };

/** An edge in a connection */
export type PostFormatToPostConnectionEdge = Edge &
  PostConnectionEdge & {
    __typename?: "PostFormatToPostConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Post;
  };

/** Page Info on the &quot;PostFormatToPostConnection&quot; */
export type PostFormatToPostConnectionPageInfo = PageInfo &
  PostConnectionPageInfo &
  WpPageInfo & {
    __typename?: "PostFormatToPostConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the PostFormatToPostConnection connection */
export type PostFormatToPostConnectionWhereArgs = {
  /** The user that's connected as the author of the object. Use the userId for the author object. */
  author?: InputMaybe<Scalars["Int"]["input"]>;
  /** Find objects connected to author(s) in the array of author's userIds */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Find objects connected to the author by the author's nicename */
  authorName?: InputMaybe<Scalars["String"]["input"]>;
  /** Find objects NOT connected to author(s) in the array of author's userIds */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Category ID */
  categoryId?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of category IDs, used to display objects from one category OR another */
  categoryIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Use Category Slug */
  categoryName?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of category IDs, used to display objects from one category OR another */
  categoryNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Tag Slug */
  tag?: InputMaybe<Scalars["String"]["input"]>;
  /** Use Tag ID */
  tagId?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of tag IDs, used to display objects from one tag OR another */
  tagIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of tag IDs, used to display objects from one tag OR another */
  tagNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of tag slugs, used to display objects from one tag AND another */
  tagSlugAnd?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Array of tag slugs, used to include objects in ANY specified tags */
  tagSlugIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the PostFormat type and the Taxonomy type */
export type PostFormatToTaxonomyConnectionEdge = Edge &
  OneToOneConnection &
  TaxonomyConnectionEdge & {
    __typename?: "PostFormatToTaxonomyConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: Taxonomy;
  };

/** The Type of Identifier used to fetch a single resource. Default is ID. */
export enum PostIdType {
  /** Identify a resource by the Database ID. */
  DatabaseId = "DATABASE_ID",
  /** Identify a resource by the (hashed) Global ID. */
  Id = "ID",
  /** Identify a resource by the slug. Available to non-hierarchcial Types where the slug is a unique identifier. */
  Slug = "SLUG",
  /** Identify a resource by the URI. */
  Uri = "URI",
}

/** The format of post field data. */
export enum PostObjectFieldFormatEnum {
  /** Provide the field value directly from database. Null on unauthenticated requests. */
  Raw = "RAW",
  /** Provide the field value as rendered by WordPress. Default. */
  Rendered = "RENDERED",
}

/** The column to use when filtering by date */
export enum PostObjectsConnectionDateColumnEnum {
  /** The date the comment was created in local time. */
  Date = "DATE",
  /** The most recent modification date of the comment. */
  Modified = "MODIFIED",
}

/** Field to order the connection by */
export enum PostObjectsConnectionOrderbyEnum {
  /** Order by author */
  Author = "AUTHOR",
  /** Order by the number of comments it has acquired */
  CommentCount = "COMMENT_COUNT",
  /** Order by publish date */
  Date = "DATE",
  /** Preserve the ID order given in the IN array */
  In = "IN",
  /** Order by the menu order value */
  MenuOrder = "MENU_ORDER",
  /** Order by last modified date */
  Modified = "MODIFIED",
  /** Preserve slug order given in the NAME_IN array */
  NameIn = "NAME_IN",
  /** Order by parent ID */
  Parent = "PARENT",
  /** Order by slug */
  Slug = "SLUG",
  /** Order by title */
  Title = "TITLE",
}

/** Options for ordering the connection */
export type PostObjectsConnectionOrderbyInput = {
  /** The field to order the connection by */
  field: PostObjectsConnectionOrderbyEnum;
  /** Possible directions in which to order a list of items */
  order: OrderEnum;
};

/** Set relationships between the post to postFormats */
export type PostPostFormatsInput = {
  /** If true, this will append the postFormat to existing related postFormats. If false, this will replace existing relationships. Default true. */
  append?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** The input list of items to set. */
  nodes?: InputMaybe<Array<InputMaybe<PostPostFormatsNodeInput>>>;
};

/** List of postFormats to connect the post to. If an ID is set, it will be used to create the connection. If not, it will look for a slug. If neither are valid existing terms, and the site is configured to allow terms to be created during post mutations, a term will be created using the Name if it exists in the input, then fallback to the slug if it exists. */
export type PostPostFormatsNodeInput = {
  /** The description of the postFormat. This field is used to set a description of the postFormat if a new one is created during the mutation. */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the postFormat. If present, this will be used to connect to the post. If no existing postFormat exists with this ID, no connection will be made. */
  id?: InputMaybe<Scalars["ID"]["input"]>;
  /** The name of the postFormat. This field is used to create a new term, if term creation is enabled in nested mutations, and if one does not already exist with the provided slug or ID or if a slug or ID is not provided. If no name is included and a term is created, the creation will fallback to the slug field. */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** The slug of the postFormat. If no ID is present, this field will be used to make a connection. If no existing term exists with this slug, this field will be used as a fallback to the Name field when creating a new term to connect to, if term creation is enabled as a nested mutation. */
  slug?: InputMaybe<Scalars["String"]["input"]>;
};

/** The status of the object. */
export enum PostStatusEnum {
  /** Objects with the auto-draft status */
  AutoDraft = "AUTO_DRAFT",
  /** Objects with the draft status */
  Draft = "DRAFT",
  /** Objects with the future status */
  Future = "FUTURE",
  /** Objects with the inherit status */
  Inherit = "INHERIT",
  /** Objects with the pending status */
  Pending = "PENDING",
  /** Objects with the private status */
  Private = "PRIVATE",
  /** Objects with the publish status */
  Publish = "PUBLISH",
  /** Objects with the request-completed status */
  RequestCompleted = "REQUEST_COMPLETED",
  /** Objects with the request-confirmed status */
  RequestConfirmed = "REQUEST_CONFIRMED",
  /** Objects with the request-failed status */
  RequestFailed = "REQUEST_FAILED",
  /** Objects with the request-pending status */
  RequestPending = "REQUEST_PENDING",
  /** Objects with the trash status */
  Trash = "TRASH",
}

/** Set relationships between the post to tags */
export type PostTagsInput = {
  /** If true, this will append the tag to existing related tags. If false, this will replace existing relationships. Default true. */
  append?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** The input list of items to set. */
  nodes?: InputMaybe<Array<InputMaybe<PostTagsNodeInput>>>;
};

/** List of tags to connect the post to. If an ID is set, it will be used to create the connection. If not, it will look for a slug. If neither are valid existing terms, and the site is configured to allow terms to be created during post mutations, a term will be created using the Name if it exists in the input, then fallback to the slug if it exists. */
export type PostTagsNodeInput = {
  /** The description of the tag. This field is used to set a description of the tag if a new one is created during the mutation. */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the tag. If present, this will be used to connect to the post. If no existing tag exists with this ID, no connection will be made. */
  id?: InputMaybe<Scalars["ID"]["input"]>;
  /** The name of the tag. This field is used to create a new term, if term creation is enabled in nested mutations, and if one does not already exist with the provided slug or ID or if a slug or ID is not provided. If no name is included and a term is created, the creation will fallback to the slug field. */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** The slug of the tag. If no ID is present, this field will be used to make a connection. If no existing term exists with this slug, this field will be used as a fallback to the Name field when creating a new term to connect to, if term creation is enabled as a nested mutation. */
  slug?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the Post type and the category type */
export type PostToCategoryConnection = CategoryConnection &
  Connection & {
    __typename?: "PostToCategoryConnection";
    /** Edges for the PostToCategoryConnection connection */
    edges: Array<PostToCategoryConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Category>;
    /** Information about pagination in a connection. */
    pageInfo: PostToCategoryConnectionPageInfo;
  };

/** An edge in a connection */
export type PostToCategoryConnectionEdge = CategoryConnectionEdge &
  Edge & {
    __typename?: "PostToCategoryConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The Yoast SEO Primary category */
    isPrimary?: Maybe<Scalars["Boolean"]["output"]>;
    /** The item at the end of the edge */
    node: Category;
  };

/** Page Info on the &quot;PostToCategoryConnection&quot; */
export type PostToCategoryConnectionPageInfo = CategoryConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "PostToCategoryConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the PostToCategoryConnection connection */
export type PostToCategoryConnectionWhereArgs = {
  /** Unique cache key to be produced when this query is stored in an object cache. Default is 'core'. */
  cacheDomain?: InputMaybe<Scalars["String"]["input"]>;
  /** Term ID to retrieve child terms of. If multiple taxonomies are passed, $child_of is ignored. Default 0. */
  childOf?: InputMaybe<Scalars["Int"]["input"]>;
  /** True to limit results to terms that have no children. This parameter has no effect on non-hierarchical taxonomies. Default false. */
  childless?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Retrieve terms where the description is LIKE the input value. Default empty. */
  descriptionLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of term ids to exclude. If $include is non-empty, $exclude is ignored. Default empty array. */
  exclude?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term ids to exclude along with all of their descendant terms. If $include is non-empty, $exclude_tree is ignored. Default empty array. */
  excludeTree?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to hide terms not assigned to any posts. Accepts true or false. Default false */
  hideEmpty?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Whether to include terms that have non-empty descendants (even if $hide_empty is set to true). Default true. */
  hierarchical?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Array of term ids to include. Default empty array. */
  include?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of names to return term(s) for. Default empty. */
  name?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Retrieve terms where the name is LIKE the input value. Default empty. */
  nameLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of object IDs. Results will be limited to terms associated with these objects. */
  objectIds?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Direction the connection should be ordered in */
  order?: InputMaybe<OrderEnum>;
  /** Field(s) to order terms by. Defaults to 'name'. */
  orderby?: InputMaybe<TermObjectsConnectionOrderbyEnum>;
  /** Whether to pad the quantity of a term's children in the quantity of each term's "count" object variable. Default false. */
  padCounts?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Parent term ID to retrieve direct-child terms of. Default empty. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Search criteria to match terms. Will be SQL-formatted with wildcards before and after. Default empty. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of slugs to return term(s) for. Default empty. */
  slug?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomyId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to prime meta caches for matched terms. Default true. */
  updateTermMetaCache?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** Connection between the Post type and the Comment type */
export type PostToCommentConnection = CommentConnection &
  Connection & {
    __typename?: "PostToCommentConnection";
    /** Edges for the PostToCommentConnection connection */
    edges: Array<PostToCommentConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Comment>;
    /** Information about pagination in a connection. */
    pageInfo: PostToCommentConnectionPageInfo;
  };

/** An edge in a connection */
export type PostToCommentConnectionEdge = CommentConnectionEdge &
  Edge & {
    __typename?: "PostToCommentConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Comment;
  };

/** Page Info on the &quot;PostToCommentConnection&quot; */
export type PostToCommentConnectionPageInfo = CommentConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "PostToCommentConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the PostToCommentConnection connection */
export type PostToCommentConnectionWhereArgs = {
  /** Comment author email address. */
  authorEmail?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of author IDs to include comments for. */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to exclude comments for. */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Comment author URL. */
  authorUrl?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of comment IDs to include. */
  commentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of IDs of users whose unapproved comments will be returned by the query regardless of status. */
  commentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Include comments of a given type. */
  commentType?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments from a given array of comment types. */
  commentTypeIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Exclude comments from a given array of comment types. */
  commentTypeNotIn?: InputMaybe<Scalars["String"]["input"]>;
  /** Content object author ID to limit results by. */
  contentAuthor?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to retrieve comments for. */
  contentAuthorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs *not* to retrieve comments for. */
  contentAuthorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Limit results to those affiliated with a given content object ID. */
  contentId?: InputMaybe<Scalars["ID"]["input"]>;
  /** Array of content object IDs to include affiliated comments for. */
  contentIdIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of content object IDs to exclude affiliated comments for. */
  contentIdNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Content object name (i.e. slug ) to retrieve affiliated comments for. */
  contentName?: InputMaybe<Scalars["String"]["input"]>;
  /** Content Object parent ID to retrieve affiliated comments for. */
  contentParent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of content object statuses to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentStatus?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Content object type or array of types to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentType?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Array of IDs or email addresses of users whose unapproved comments will be returned by the query regardless of $status. Default empty */
  includeUnapproved?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Karma score to retrieve matching comments for. */
  karma?: InputMaybe<Scalars["Int"]["input"]>;
  /** The cardinality of the order of the connection */
  order?: InputMaybe<OrderEnum>;
  /** Field to order the comments by. */
  orderby?: InputMaybe<CommentsConnectionOrderbyEnum>;
  /** Parent ID of comment to retrieve children of. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of parent IDs of comments to retrieve children for. */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of parent IDs of comments *not* to retrieve children for. */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Search term(s) to retrieve matching comments for. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Comment status to limit results by. */
  status?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments for a specific user ID. */
  userId?: InputMaybe<Scalars["ID"]["input"]>;
};

/** Connection between the Post type and the postFormat type */
export type PostToPostFormatConnection = Connection &
  PostFormatConnection & {
    __typename?: "PostToPostFormatConnection";
    /** Edges for the PostToPostFormatConnection connection */
    edges: Array<PostToPostFormatConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<PostFormat>;
    /** Information about pagination in a connection. */
    pageInfo: PostToPostFormatConnectionPageInfo;
  };

/** An edge in a connection */
export type PostToPostFormatConnectionEdge = Edge &
  PostFormatConnectionEdge & {
    __typename?: "PostToPostFormatConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The Yoast SEO Primary post_format */
    isPrimary?: Maybe<Scalars["Boolean"]["output"]>;
    /** The item at the end of the edge */
    node: PostFormat;
  };

/** Page Info on the &quot;PostToPostFormatConnection&quot; */
export type PostToPostFormatConnectionPageInfo = PageInfo &
  PostFormatConnectionPageInfo &
  WpPageInfo & {
    __typename?: "PostToPostFormatConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the PostToPostFormatConnection connection */
export type PostToPostFormatConnectionWhereArgs = {
  /** Unique cache key to be produced when this query is stored in an object cache. Default is 'core'. */
  cacheDomain?: InputMaybe<Scalars["String"]["input"]>;
  /** Term ID to retrieve child terms of. If multiple taxonomies are passed, $child_of is ignored. Default 0. */
  childOf?: InputMaybe<Scalars["Int"]["input"]>;
  /** True to limit results to terms that have no children. This parameter has no effect on non-hierarchical taxonomies. Default false. */
  childless?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Retrieve terms where the description is LIKE the input value. Default empty. */
  descriptionLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of term ids to exclude. If $include is non-empty, $exclude is ignored. Default empty array. */
  exclude?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term ids to exclude along with all of their descendant terms. If $include is non-empty, $exclude_tree is ignored. Default empty array. */
  excludeTree?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to hide terms not assigned to any posts. Accepts true or false. Default false */
  hideEmpty?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Whether to include terms that have non-empty descendants (even if $hide_empty is set to true). Default true. */
  hierarchical?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Array of term ids to include. Default empty array. */
  include?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of names to return term(s) for. Default empty. */
  name?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Retrieve terms where the name is LIKE the input value. Default empty. */
  nameLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of object IDs. Results will be limited to terms associated with these objects. */
  objectIds?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Direction the connection should be ordered in */
  order?: InputMaybe<OrderEnum>;
  /** Field(s) to order terms by. Defaults to 'name'. */
  orderby?: InputMaybe<TermObjectsConnectionOrderbyEnum>;
  /** Whether to pad the quantity of a term's children in the quantity of each term's "count" object variable. Default false. */
  padCounts?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Parent term ID to retrieve direct-child terms of. Default empty. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Search criteria to match terms. Will be SQL-formatted with wildcards before and after. Default empty. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of slugs to return term(s) for. Default empty. */
  slug?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomyId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to prime meta caches for matched terms. Default true. */
  updateTermMetaCache?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** Connection between the Post type and the post type */
export type PostToPreviewConnectionEdge = Edge &
  OneToOneConnection &
  PostConnectionEdge & {
    __typename?: "PostToPreviewConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: Post;
  };

/** Connection between the Post type and the post type */
export type PostToRevisionConnection = Connection &
  PostConnection & {
    __typename?: "PostToRevisionConnection";
    /** Edges for the PostToRevisionConnection connection */
    edges: Array<PostToRevisionConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Post>;
    /** Information about pagination in a connection. */
    pageInfo: PostToRevisionConnectionPageInfo;
  };

/** An edge in a connection */
export type PostToRevisionConnectionEdge = Edge &
  PostConnectionEdge & {
    __typename?: "PostToRevisionConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Post;
  };

/** Page Info on the &quot;PostToRevisionConnection&quot; */
export type PostToRevisionConnectionPageInfo = PageInfo &
  PostConnectionPageInfo &
  WpPageInfo & {
    __typename?: "PostToRevisionConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the PostToRevisionConnection connection */
export type PostToRevisionConnectionWhereArgs = {
  /** The user that's connected as the author of the object. Use the userId for the author object. */
  author?: InputMaybe<Scalars["Int"]["input"]>;
  /** Find objects connected to author(s) in the array of author's userIds */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Find objects connected to the author by the author's nicename */
  authorName?: InputMaybe<Scalars["String"]["input"]>;
  /** Find objects NOT connected to author(s) in the array of author's userIds */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Category ID */
  categoryId?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of category IDs, used to display objects from one category OR another */
  categoryIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Use Category Slug */
  categoryName?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of category IDs, used to display objects from one category OR another */
  categoryNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Tag Slug */
  tag?: InputMaybe<Scalars["String"]["input"]>;
  /** Use Tag ID */
  tagId?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of tag IDs, used to display objects from one tag OR another */
  tagIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of tag IDs, used to display objects from one tag OR another */
  tagNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of tag slugs, used to display objects from one tag AND another */
  tagSlugAnd?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Array of tag slugs, used to include objects in ANY specified tags */
  tagSlugIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the Post type and the tag type */
export type PostToTagConnection = Connection &
  TagConnection & {
    __typename?: "PostToTagConnection";
    /** Edges for the PostToTagConnection connection */
    edges: Array<PostToTagConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Tag>;
    /** Information about pagination in a connection. */
    pageInfo: PostToTagConnectionPageInfo;
  };

/** An edge in a connection */
export type PostToTagConnectionEdge = Edge &
  TagConnectionEdge & {
    __typename?: "PostToTagConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The Yoast SEO Primary post_tag */
    isPrimary?: Maybe<Scalars["Boolean"]["output"]>;
    /** The item at the end of the edge */
    node: Tag;
  };

/** Page Info on the &quot;PostToTagConnection&quot; */
export type PostToTagConnectionPageInfo = PageInfo &
  TagConnectionPageInfo &
  WpPageInfo & {
    __typename?: "PostToTagConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the PostToTagConnection connection */
export type PostToTagConnectionWhereArgs = {
  /** Unique cache key to be produced when this query is stored in an object cache. Default is 'core'. */
  cacheDomain?: InputMaybe<Scalars["String"]["input"]>;
  /** Term ID to retrieve child terms of. If multiple taxonomies are passed, $child_of is ignored. Default 0. */
  childOf?: InputMaybe<Scalars["Int"]["input"]>;
  /** True to limit results to terms that have no children. This parameter has no effect on non-hierarchical taxonomies. Default false. */
  childless?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Retrieve terms where the description is LIKE the input value. Default empty. */
  descriptionLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of term ids to exclude. If $include is non-empty, $exclude is ignored. Default empty array. */
  exclude?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term ids to exclude along with all of their descendant terms. If $include is non-empty, $exclude_tree is ignored. Default empty array. */
  excludeTree?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to hide terms not assigned to any posts. Accepts true or false. Default false */
  hideEmpty?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Whether to include terms that have non-empty descendants (even if $hide_empty is set to true). Default true. */
  hierarchical?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Array of term ids to include. Default empty array. */
  include?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of names to return term(s) for. Default empty. */
  name?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Retrieve terms where the name is LIKE the input value. Default empty. */
  nameLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of object IDs. Results will be limited to terms associated with these objects. */
  objectIds?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Direction the connection should be ordered in */
  order?: InputMaybe<OrderEnum>;
  /** Field(s) to order terms by. Defaults to 'name'. */
  orderby?: InputMaybe<TermObjectsConnectionOrderbyEnum>;
  /** Whether to pad the quantity of a term's children in the quantity of each term's "count" object variable. Default false. */
  padCounts?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Parent term ID to retrieve direct-child terms of. Default empty. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Search criteria to match terms. Will be SQL-formatted with wildcards before and after. Default empty. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of slugs to return term(s) for. Default empty. */
  slug?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomyId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to prime meta caches for matched terms. Default true. */
  updateTermMetaCache?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** Connection between the Post type and the TermNode type */
export type PostToTermNodeConnection = Connection &
  TermNodeConnection & {
    __typename?: "PostToTermNodeConnection";
    /** Edges for the PostToTermNodeConnection connection */
    edges: Array<PostToTermNodeConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<TermNode>;
    /** Information about pagination in a connection. */
    pageInfo: PostToTermNodeConnectionPageInfo;
  };

/** An edge in a connection */
export type PostToTermNodeConnectionEdge = Edge &
  TermNodeConnectionEdge & {
    __typename?: "PostToTermNodeConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: TermNode;
  };

/** Page Info on the &quot;PostToTermNodeConnection&quot; */
export type PostToTermNodeConnectionPageInfo = PageInfo &
  TermNodeConnectionPageInfo &
  WpPageInfo & {
    __typename?: "PostToTermNodeConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the PostToTermNodeConnection connection */
export type PostToTermNodeConnectionWhereArgs = {
  /** Unique cache key to be produced when this query is stored in an object cache. Default is 'core'. */
  cacheDomain?: InputMaybe<Scalars["String"]["input"]>;
  /** Term ID to retrieve child terms of. If multiple taxonomies are passed, $child_of is ignored. Default 0. */
  childOf?: InputMaybe<Scalars["Int"]["input"]>;
  /** True to limit results to terms that have no children. This parameter has no effect on non-hierarchical taxonomies. Default false. */
  childless?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Retrieve terms where the description is LIKE the input value. Default empty. */
  descriptionLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of term ids to exclude. If $include is non-empty, $exclude is ignored. Default empty array. */
  exclude?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term ids to exclude along with all of their descendant terms. If $include is non-empty, $exclude_tree is ignored. Default empty array. */
  excludeTree?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to hide terms not assigned to any posts. Accepts true or false. Default false */
  hideEmpty?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Whether to include terms that have non-empty descendants (even if $hide_empty is set to true). Default true. */
  hierarchical?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Array of term ids to include. Default empty array. */
  include?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of names to return term(s) for. Default empty. */
  name?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Retrieve terms where the name is LIKE the input value. Default empty. */
  nameLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of object IDs. Results will be limited to terms associated with these objects. */
  objectIds?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Direction the connection should be ordered in */
  order?: InputMaybe<OrderEnum>;
  /** Field(s) to order terms by. Defaults to 'name'. */
  orderby?: InputMaybe<TermObjectsConnectionOrderbyEnum>;
  /** Whether to pad the quantity of a term's children in the quantity of each term's "count" object variable. Default false. */
  padCounts?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Parent term ID to retrieve direct-child terms of. Default empty. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Search criteria to match terms. Will be SQL-formatted with wildcards before and after. Default empty. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of slugs to return term(s) for. Default empty. */
  slug?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** The Taxonomy to filter terms by */
  taxonomies?: InputMaybe<Array<InputMaybe<TaxonomyEnum>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomyId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to prime meta caches for matched terms. Default true. */
  updateTermMetaCache?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** Details for labels of the PostType */
export type PostTypeLabelDetails = {
  __typename?: "PostTypeLabelDetails";
  /** Default is ‘Add New’ for both hierarchical and non-hierarchical types. */
  addNew?: Maybe<Scalars["String"]["output"]>;
  /** Label for adding a new singular item. */
  addNewItem?: Maybe<Scalars["String"]["output"]>;
  /** Label to signify all items in a submenu link. */
  allItems?: Maybe<Scalars["String"]["output"]>;
  /** Label for archives in nav menus */
  archives?: Maybe<Scalars["String"]["output"]>;
  /** Label for the attributes meta box. */
  attributes?: Maybe<Scalars["String"]["output"]>;
  /** Label for editing a singular item. */
  editItem?: Maybe<Scalars["String"]["output"]>;
  /** Label for the Featured Image meta box title. */
  featuredImage?: Maybe<Scalars["String"]["output"]>;
  /** Label for the table views hidden heading. */
  filterItemsList?: Maybe<Scalars["String"]["output"]>;
  /** Label for the media frame button. */
  insertIntoItem?: Maybe<Scalars["String"]["output"]>;
  /** Label for the table hidden heading. */
  itemsList?: Maybe<Scalars["String"]["output"]>;
  /** Label for the table pagination hidden heading. */
  itemsListNavigation?: Maybe<Scalars["String"]["output"]>;
  /** Label for the menu name. */
  menuName?: Maybe<Scalars["String"]["output"]>;
  /** General name for the post type, usually plural. */
  name?: Maybe<Scalars["String"]["output"]>;
  /** Label for the new item page title. */
  newItem?: Maybe<Scalars["String"]["output"]>;
  /** Label used when no items are found. */
  notFound?: Maybe<Scalars["String"]["output"]>;
  /** Label used when no items are in the trash. */
  notFoundInTrash?: Maybe<Scalars["String"]["output"]>;
  /** Label used to prefix parents of hierarchical items. */
  parentItemColon?: Maybe<Scalars["String"]["output"]>;
  /** Label for removing the featured image. */
  removeFeaturedImage?: Maybe<Scalars["String"]["output"]>;
  /** Label for searching plural items. */
  searchItems?: Maybe<Scalars["String"]["output"]>;
  /** Label for setting the featured image. */
  setFeaturedImage?: Maybe<Scalars["String"]["output"]>;
  /** Name for one object of this post type. */
  singularName?: Maybe<Scalars["String"]["output"]>;
  /** Label for the media frame filter. */
  uploadedToThisItem?: Maybe<Scalars["String"]["output"]>;
  /** Label in the media frame for using a featured image. */
  useFeaturedImage?: Maybe<Scalars["String"]["output"]>;
  /** Label for viewing a singular item. */
  viewItem?: Maybe<Scalars["String"]["output"]>;
  /** Label for viewing post type archives. */
  viewItems?: Maybe<Scalars["String"]["output"]>;
};

export type PostTypeSeo = {
  __typename?: "PostTypeSEO";
  breadcrumbs?: Maybe<Array<Maybe<SeoPostTypeBreadcrumbs>>>;
  canonical?: Maybe<Scalars["String"]["output"]>;
  cornerstone?: Maybe<Scalars["Boolean"]["output"]>;
  focuskw?: Maybe<Scalars["String"]["output"]>;
  fullHead?: Maybe<Scalars["String"]["output"]>;
  metaDesc?: Maybe<Scalars["String"]["output"]>;
  metaKeywords?: Maybe<Scalars["String"]["output"]>;
  metaRobotsNofollow?: Maybe<Scalars["String"]["output"]>;
  metaRobotsNoindex?: Maybe<Scalars["String"]["output"]>;
  opengraphAuthor?: Maybe<Scalars["String"]["output"]>;
  opengraphDescription?: Maybe<Scalars["String"]["output"]>;
  opengraphImage?: Maybe<MediaItem>;
  opengraphModifiedTime?: Maybe<Scalars["String"]["output"]>;
  opengraphPublishedTime?: Maybe<Scalars["String"]["output"]>;
  opengraphPublisher?: Maybe<Scalars["String"]["output"]>;
  opengraphSiteName?: Maybe<Scalars["String"]["output"]>;
  opengraphTitle?: Maybe<Scalars["String"]["output"]>;
  opengraphType?: Maybe<Scalars["String"]["output"]>;
  opengraphUrl?: Maybe<Scalars["String"]["output"]>;
  readingTime?: Maybe<Scalars["Float"]["output"]>;
  schema?: Maybe<SeoPostTypeSchema>;
  title?: Maybe<Scalars["String"]["output"]>;
  twitterDescription?: Maybe<Scalars["String"]["output"]>;
  twitterImage?: Maybe<MediaItem>;
  twitterTitle?: Maybe<Scalars["String"]["output"]>;
};

/** Nodes that can be seen in a preview (unpublished) state. */
export type Previewable = {
  /** Whether the object is a node in the preview state */
  isPreview?: Maybe<Scalars["Boolean"]["output"]>;
  /** The database id of the preview node */
  previewRevisionDatabaseId?: Maybe<Scalars["Int"]["output"]>;
  /** Whether the object is a node in the preview state */
  previewRevisionId?: Maybe<Scalars["ID"]["output"]>;
};

/** The reading setting type */
export type ReadingSettings = {
  __typename?: "ReadingSettings";
  /** The ID of the page that should display the latest posts */
  pageForPosts?: Maybe<Scalars["Int"]["output"]>;
  /** The ID of the page that should be displayed on the front page */
  pageOnFront?: Maybe<Scalars["Int"]["output"]>;
  /** Blog pages show at most. */
  postsPerPage?: Maybe<Scalars["Int"]["output"]>;
  /** What to show on the front page */
  showOnFront?: Maybe<Scalars["String"]["output"]>;
};

/** Input for the refreshJwtAuthToken mutation. */
export type RefreshJwtAuthTokenInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** A valid, previously issued JWT refresh token. If valid a new Auth token will be provided. If invalid, expired, revoked or otherwise invalid, a new AuthToken will not be provided. */
  jwtRefreshToken: Scalars["String"]["input"];
};

/** The payload for the refreshJwtAuthToken mutation. */
export type RefreshJwtAuthTokenPayload = {
  __typename?: "RefreshJwtAuthTokenPayload";
  /** JWT Token that can be used in future requests for Authentication */
  authToken?: Maybe<Scalars["String"]["output"]>;
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
};

/** Input for the registerUser mutation. */
export type RegisterUserInput = {
  /** User's AOL IM account. */
  aim?: InputMaybe<Scalars["String"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** A string containing content about the user. */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** A string that will be shown on the site. Defaults to user's username. It is likely that you will want to change this, for both appearance and security through obscurity (that is if you dont use and delete the default admin user). */
  displayName?: InputMaybe<Scalars["String"]["input"]>;
  /** A string containing the user's email address. */
  email?: InputMaybe<Scalars["String"]["input"]>;
  /** 	The user's first name. */
  firstName?: InputMaybe<Scalars["String"]["input"]>;
  /** User's Jabber account. */
  jabber?: InputMaybe<Scalars["String"]["input"]>;
  /** The user's last name. */
  lastName?: InputMaybe<Scalars["String"]["input"]>;
  /** User's locale. */
  locale?: InputMaybe<Scalars["String"]["input"]>;
  /** A string that contains a URL-friendly name for the user. The default is the user's username. */
  nicename?: InputMaybe<Scalars["String"]["input"]>;
  /** The user's nickname, defaults to the user's username. */
  nickname?: InputMaybe<Scalars["String"]["input"]>;
  /** A string that contains the plain text password for the user. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** If true, this will refresh the users JWT secret. */
  refreshJwtUserSecret?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** The date the user registered. Format is Y-m-d H:i:s. */
  registered?: InputMaybe<Scalars["String"]["input"]>;
  /** If true, this will revoke the users JWT secret. If false, this will unrevoke the JWT secret AND issue a new one. To revoke, the user must have proper capabilities to edit users JWT secrets. */
  revokeJwtUserSecret?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** A string for whether to enable the rich editor or not. False if not empty. */
  richEditing?: InputMaybe<Scalars["String"]["input"]>;
  /** A string that contains the user's username. */
  username: Scalars["String"]["input"];
  /** A string containing the user's URL for the user's web site. */
  websiteUrl?: InputMaybe<Scalars["String"]["input"]>;
  /** User's Yahoo IM account. */
  yim?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the registerUser mutation. */
export type RegisterUserPayload = {
  __typename?: "RegisterUserPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The User object mutation type. */
  user?: Maybe<User>;
};

/** The logical relation between each item in the array when there are more than one. */
export enum RelationEnum {
  /** The logical AND condition returns true if both operands are true, otherwise, it returns false. */
  And = "AND",
  /** The logical OR condition returns false if both operands are false, otherwise, it returns true. */
  Or = "OR",
}

/** Input for the resetUserPassword mutation. */
export type ResetUserPasswordInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** Password reset key */
  key?: InputMaybe<Scalars["String"]["input"]>;
  /** The user's login (username). */
  login?: InputMaybe<Scalars["String"]["input"]>;
  /** The new password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the resetUserPassword mutation. */
export type ResetUserPasswordPayload = {
  __typename?: "ResetUserPasswordPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The User object mutation type. */
  user?: Maybe<User>;
};

/** Input for the restoreComment mutation. */
export type RestoreCommentInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the comment to be restored */
  id: Scalars["ID"]["input"];
};

/** The payload for the restoreComment mutation. */
export type RestoreCommentPayload = {
  __typename?: "RestoreCommentPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The restored comment object */
  comment?: Maybe<Comment>;
  /** The ID of the restored comment */
  restoredId?: Maybe<Scalars["ID"]["output"]>;
};

/** The root mutation */
export type RootMutation = {
  __typename?: "RootMutation";
  /** The createCategory mutation */
  createCategory?: Maybe<CreateCategoryPayload>;
  /** The createComment mutation */
  createComment?: Maybe<CreateCommentPayload>;
  /** The createMediaItem mutation */
  createMediaItem?: Maybe<CreateMediaItemPayload>;
  /** The createPage mutation */
  createPage?: Maybe<CreatePagePayload>;
  /** The createPost mutation */
  createPost?: Maybe<CreatePostPayload>;
  /** The createPostFormat mutation */
  createPostFormat?: Maybe<CreatePostFormatPayload>;
  /** The createTag mutation */
  createTag?: Maybe<CreateTagPayload>;
  /** The createUser mutation */
  createUser?: Maybe<CreateUserPayload>;
  /** The deleteCategory mutation */
  deleteCategory?: Maybe<DeleteCategoryPayload>;
  /** The deleteComment mutation */
  deleteComment?: Maybe<DeleteCommentPayload>;
  /** The deleteMediaItem mutation */
  deleteMediaItem?: Maybe<DeleteMediaItemPayload>;
  /** The deletePage mutation */
  deletePage?: Maybe<DeletePagePayload>;
  /** The deletePost mutation */
  deletePost?: Maybe<DeletePostPayload>;
  /** The deletePostFormat mutation */
  deletePostFormat?: Maybe<DeletePostFormatPayload>;
  /** The deleteTag mutation */
  deleteTag?: Maybe<DeleteTagPayload>;
  /** The deleteUser mutation */
  deleteUser?: Maybe<DeleteUserPayload>;
  /** Increase the count. */
  increaseCount?: Maybe<Scalars["Int"]["output"]>;
  /** Login a user. Request for an authToken and User details in response */
  login?: Maybe<LoginPayload>;
  /** Use a valid JWT Refresh token to retrieve a new JWT Auth Token */
  refreshJwtAuthToken?: Maybe<RefreshJwtAuthTokenPayload>;
  /** The registerUser mutation */
  registerUser?: Maybe<RegisterUserPayload>;
  /** The resetUserPassword mutation */
  resetUserPassword?: Maybe<ResetUserPasswordPayload>;
  /** The restoreComment mutation */
  restoreComment?: Maybe<RestoreCommentPayload>;
  /** Send password reset email to user */
  sendPasswordResetEmail?: Maybe<SendPasswordResetEmailPayload>;
  /** The updateCategory mutation */
  updateCategory?: Maybe<UpdateCategoryPayload>;
  /** The updateComment mutation */
  updateComment?: Maybe<UpdateCommentPayload>;
  /** The updateMediaItem mutation */
  updateMediaItem?: Maybe<UpdateMediaItemPayload>;
  /** The updatePage mutation */
  updatePage?: Maybe<UpdatePagePayload>;
  /** The updatePost mutation */
  updatePost?: Maybe<UpdatePostPayload>;
  /** The updatePostFormat mutation */
  updatePostFormat?: Maybe<UpdatePostFormatPayload>;
  /** The updateSettings mutation */
  updateSettings?: Maybe<UpdateSettingsPayload>;
  /** The updateTag mutation */
  updateTag?: Maybe<UpdateTagPayload>;
  /** The updateUser mutation */
  updateUser?: Maybe<UpdateUserPayload>;
};

/** The root mutation */
export type RootMutationCreateCategoryArgs = {
  input: CreateCategoryInput;
};

/** The root mutation */
export type RootMutationCreateCommentArgs = {
  input: CreateCommentInput;
};

/** The root mutation */
export type RootMutationCreateMediaItemArgs = {
  input: CreateMediaItemInput;
};

/** The root mutation */
export type RootMutationCreatePageArgs = {
  input: CreatePageInput;
};

/** The root mutation */
export type RootMutationCreatePostArgs = {
  input: CreatePostInput;
};

/** The root mutation */
export type RootMutationCreatePostFormatArgs = {
  input: CreatePostFormatInput;
};

/** The root mutation */
export type RootMutationCreateTagArgs = {
  input: CreateTagInput;
};

/** The root mutation */
export type RootMutationCreateUserArgs = {
  input: CreateUserInput;
};

/** The root mutation */
export type RootMutationDeleteCategoryArgs = {
  input: DeleteCategoryInput;
};

/** The root mutation */
export type RootMutationDeleteCommentArgs = {
  input: DeleteCommentInput;
};

/** The root mutation */
export type RootMutationDeleteMediaItemArgs = {
  input: DeleteMediaItemInput;
};

/** The root mutation */
export type RootMutationDeletePageArgs = {
  input: DeletePageInput;
};

/** The root mutation */
export type RootMutationDeletePostArgs = {
  input: DeletePostInput;
};

/** The root mutation */
export type RootMutationDeletePostFormatArgs = {
  input: DeletePostFormatInput;
};

/** The root mutation */
export type RootMutationDeleteTagArgs = {
  input: DeleteTagInput;
};

/** The root mutation */
export type RootMutationDeleteUserArgs = {
  input: DeleteUserInput;
};

/** The root mutation */
export type RootMutationIncreaseCountArgs = {
  count?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The root mutation */
export type RootMutationLoginArgs = {
  input: LoginInput;
};

/** The root mutation */
export type RootMutationRefreshJwtAuthTokenArgs = {
  input: RefreshJwtAuthTokenInput;
};

/** The root mutation */
export type RootMutationRegisterUserArgs = {
  input: RegisterUserInput;
};

/** The root mutation */
export type RootMutationResetUserPasswordArgs = {
  input: ResetUserPasswordInput;
};

/** The root mutation */
export type RootMutationRestoreCommentArgs = {
  input: RestoreCommentInput;
};

/** The root mutation */
export type RootMutationSendPasswordResetEmailArgs = {
  input: SendPasswordResetEmailInput;
};

/** The root mutation */
export type RootMutationUpdateCategoryArgs = {
  input: UpdateCategoryInput;
};

/** The root mutation */
export type RootMutationUpdateCommentArgs = {
  input: UpdateCommentInput;
};

/** The root mutation */
export type RootMutationUpdateMediaItemArgs = {
  input: UpdateMediaItemInput;
};

/** The root mutation */
export type RootMutationUpdatePageArgs = {
  input: UpdatePageInput;
};

/** The root mutation */
export type RootMutationUpdatePostArgs = {
  input: UpdatePostInput;
};

/** The root mutation */
export type RootMutationUpdatePostFormatArgs = {
  input: UpdatePostFormatInput;
};

/** The root mutation */
export type RootMutationUpdateSettingsArgs = {
  input: UpdateSettingsInput;
};

/** The root mutation */
export type RootMutationUpdateTagArgs = {
  input: UpdateTagInput;
};

/** The root mutation */
export type RootMutationUpdateUserArgs = {
  input: UpdateUserInput;
};

/** The root entry point into the Graph */
export type RootQuery = {
  __typename?: "RootQuery";
  /** Entry point to get all settings for the site */
  allSettings?: Maybe<Settings>;
  /** Connection between the RootQuery type and the category type */
  categories?: Maybe<RootQueryToCategoryConnection>;
  /** A 0bject */
  category?: Maybe<Category>;
  /** Returns a Comment */
  comment?: Maybe<Comment>;
  /** Connection between the RootQuery type and the Comment type */
  comments?: Maybe<RootQueryToCommentConnection>;
  /** A node used to manage content */
  contentNode?: Maybe<ContentNode>;
  /** Connection between the RootQuery type and the ContentNode type */
  contentNodes?: Maybe<RootQueryToContentNodeConnection>;
  /** Fetch a Content Type node by unique Identifier */
  contentType?: Maybe<ContentType>;
  /** Connection between the RootQuery type and the ContentType type */
  contentTypes?: Maybe<RootQueryToContentTypeConnection>;
  /** Fields of the &#039;DiscussionSettings&#039; settings group */
  discussionSettings?: Maybe<DiscussionSettings>;
  /** Fields of the &#039;GeneralSettings&#039; settings group */
  generalSettings?: Maybe<GeneralSettings>;
  /** An object of the mediaItem Type.  */
  mediaItem?: Maybe<MediaItem>;
  /**
   * A mediaItem object
   * @deprecated Deprecated in favor of using the single entry point for this type with ID and IDType fields. For example, instead of postBy( id: &quot;&quot; ), use post(id: &quot;&quot; idType: &quot;&quot;)
   */
  mediaItemBy?: Maybe<MediaItem>;
  /** Connection between the RootQuery type and the mediaItem type */
  mediaItems?: Maybe<RootQueryToMediaItemConnection>;
  /** A WordPress navigation menu */
  menu?: Maybe<Menu>;
  /** A WordPress navigation menu item */
  menuItem?: Maybe<MenuItem>;
  /** Connection between the RootQuery type and the MenuItem type */
  menuItems?: Maybe<RootQueryToMenuItemConnection>;
  /** Connection between the RootQuery type and the Menu type */
  menus?: Maybe<RootQueryToMenuConnection>;
  /** Fetches an object given its ID */
  node?: Maybe<Node>;
  /** Fetches an object given its Unique Resource Identifier */
  nodeByUri?: Maybe<UniformResourceIdentifiable>;
  /** An object of the page Type.  */
  page?: Maybe<Page>;
  /**
   * A page object
   * @deprecated Deprecated in favor of using the single entry point for this type with ID and IDType fields. For example, instead of postBy( id: &quot;&quot; ), use post(id: &quot;&quot; idType: &quot;&quot;)
   */
  pageBy?: Maybe<Page>;
  /** Connection between the RootQuery type and the page type */
  pages?: Maybe<RootQueryToPageConnection>;
  /** A WordPress plugin */
  plugin?: Maybe<Plugin>;
  /** Connection between the RootQuery type and the Plugin type */
  plugins?: Maybe<RootQueryToPluginConnection>;
  /** An object of the post Type.  */
  post?: Maybe<Post>;
  /**
   * A post object
   * @deprecated Deprecated in favor of using the single entry point for this type with ID and IDType fields. For example, instead of postBy( id: &quot;&quot; ), use post(id: &quot;&quot; idType: &quot;&quot;)
   */
  postBy?: Maybe<Post>;
  /** A 0bject */
  postFormat?: Maybe<PostFormat>;
  /** Connection between the RootQuery type and the postFormat type */
  postFormats?: Maybe<RootQueryToPostFormatConnection>;
  /** Connection between the RootQuery type and the post type */
  posts?: Maybe<RootQueryToPostConnection>;
  /** Fields of the &#039;ReadingSettings&#039; settings group */
  readingSettings?: Maybe<ReadingSettings>;
  /** Connection between the RootQuery type and the EnqueuedScript type */
  registeredScripts?: Maybe<RootQueryToEnqueuedScriptConnection>;
  /** Connection between the RootQuery type and the EnqueuedStylesheet type */
  registeredStylesheets?: Maybe<RootQueryToEnqueuedStylesheetConnection>;
  /** Connection between the RootQuery type and the ContentNode type */
  revisions?: Maybe<RootQueryToRevisionsConnection>;
  /** Returns seo site data */
  seo?: Maybe<SeoConfig>;
  /** A 0bject */
  tag?: Maybe<Tag>;
  /** Connection between the RootQuery type and the tag type */
  tags?: Maybe<RootQueryToTagConnection>;
  /** Connection between the RootQuery type and the Taxonomy type */
  taxonomies?: Maybe<RootQueryToTaxonomyConnection>;
  /** Fetch a Taxonomy node by unique Identifier */
  taxonomy?: Maybe<Taxonomy>;
  /** A node in a taxonomy used to group and relate content nodes */
  termNode?: Maybe<TermNode>;
  /** Connection between the RootQuery type and the TermNode type */
  terms?: Maybe<RootQueryToTermNodeConnection>;
  /** A Theme object */
  theme?: Maybe<Theme>;
  /** Connection between the RootQuery type and the Theme type */
  themes?: Maybe<RootQueryToThemeConnection>;
  /** Returns a user */
  user?: Maybe<User>;
  /** Returns a user role */
  userRole?: Maybe<UserRole>;
  /** Connection between the RootQuery type and the UserRole type */
  userRoles?: Maybe<RootQueryToUserRoleConnection>;
  /** Connection between the RootQuery type and the User type */
  users?: Maybe<RootQueryToUserConnection>;
  /** Returns the current user */
  viewer?: Maybe<User>;
  /** Fields of the &#039;WritingSettings&#039; settings group */
  writingSettings?: Maybe<WritingSettings>;
};

/** The root entry point into the Graph */
export type RootQueryCategoriesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToCategoryConnectionWhereArgs>;
};

/** The root entry point into the Graph */
export type RootQueryCategoryArgs = {
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<CategoryIdType>;
};

/** The root entry point into the Graph */
export type RootQueryCommentArgs = {
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<CommentNodeIdTypeEnum>;
};

/** The root entry point into the Graph */
export type RootQueryCommentsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToCommentConnectionWhereArgs>;
};

/** The root entry point into the Graph */
export type RootQueryContentNodeArgs = {
  asPreview?: InputMaybe<Scalars["Boolean"]["input"]>;
  contentType?: InputMaybe<ContentTypeEnum>;
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<ContentNodeIdTypeEnum>;
};

/** The root entry point into the Graph */
export type RootQueryContentNodesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToContentNodeConnectionWhereArgs>;
};

/** The root entry point into the Graph */
export type RootQueryContentTypeArgs = {
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<ContentTypeIdTypeEnum>;
};

/** The root entry point into the Graph */
export type RootQueryContentTypesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The root entry point into the Graph */
export type RootQueryMediaItemArgs = {
  asPreview?: InputMaybe<Scalars["Boolean"]["input"]>;
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<MediaItemIdType>;
};

/** The root entry point into the Graph */
export type RootQueryMediaItemByArgs = {
  id?: InputMaybe<Scalars["ID"]["input"]>;
  mediaItemId?: InputMaybe<Scalars["Int"]["input"]>;
  slug?: InputMaybe<Scalars["String"]["input"]>;
  uri?: InputMaybe<Scalars["String"]["input"]>;
};

/** The root entry point into the Graph */
export type RootQueryMediaItemsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToMediaItemConnectionWhereArgs>;
};

/** The root entry point into the Graph */
export type RootQueryMenuArgs = {
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<MenuNodeIdTypeEnum>;
};

/** The root entry point into the Graph */
export type RootQueryMenuItemArgs = {
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<MenuItemNodeIdTypeEnum>;
};

/** The root entry point into the Graph */
export type RootQueryMenuItemsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToMenuItemConnectionWhereArgs>;
};

/** The root entry point into the Graph */
export type RootQueryMenusArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToMenuConnectionWhereArgs>;
};

/** The root entry point into the Graph */
export type RootQueryNodeArgs = {
  id?: InputMaybe<Scalars["ID"]["input"]>;
};

/** The root entry point into the Graph */
export type RootQueryNodeByUriArgs = {
  uri: Scalars["String"]["input"];
};

/** The root entry point into the Graph */
export type RootQueryPageArgs = {
  asPreview?: InputMaybe<Scalars["Boolean"]["input"]>;
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<PageIdType>;
};

/** The root entry point into the Graph */
export type RootQueryPageByArgs = {
  id?: InputMaybe<Scalars["ID"]["input"]>;
  pageId?: InputMaybe<Scalars["Int"]["input"]>;
  uri?: InputMaybe<Scalars["String"]["input"]>;
};

/** The root entry point into the Graph */
export type RootQueryPagesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToPageConnectionWhereArgs>;
};

/** The root entry point into the Graph */
export type RootQueryPluginArgs = {
  id: Scalars["ID"]["input"];
};

/** The root entry point into the Graph */
export type RootQueryPluginsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToPluginConnectionWhereArgs>;
};

/** The root entry point into the Graph */
export type RootQueryPostArgs = {
  asPreview?: InputMaybe<Scalars["Boolean"]["input"]>;
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<PostIdType>;
};

/** The root entry point into the Graph */
export type RootQueryPostByArgs = {
  id?: InputMaybe<Scalars["ID"]["input"]>;
  postId?: InputMaybe<Scalars["Int"]["input"]>;
  slug?: InputMaybe<Scalars["String"]["input"]>;
  uri?: InputMaybe<Scalars["String"]["input"]>;
};

/** The root entry point into the Graph */
export type RootQueryPostFormatArgs = {
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<PostFormatIdType>;
};

/** The root entry point into the Graph */
export type RootQueryPostFormatsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToPostFormatConnectionWhereArgs>;
};

/** The root entry point into the Graph */
export type RootQueryPostsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToPostConnectionWhereArgs>;
};

/** The root entry point into the Graph */
export type RootQueryRegisteredScriptsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The root entry point into the Graph */
export type RootQueryRegisteredStylesheetsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The root entry point into the Graph */
export type RootQueryRevisionsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToRevisionsConnectionWhereArgs>;
};

/** The root entry point into the Graph */
export type RootQueryTagArgs = {
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<TagIdType>;
};

/** The root entry point into the Graph */
export type RootQueryTagsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToTagConnectionWhereArgs>;
};

/** The root entry point into the Graph */
export type RootQueryTaxonomiesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The root entry point into the Graph */
export type RootQueryTaxonomyArgs = {
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<TaxonomyIdTypeEnum>;
};

/** The root entry point into the Graph */
export type RootQueryTermNodeArgs = {
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<TermNodeIdTypeEnum>;
  taxonomy?: InputMaybe<TaxonomyEnum>;
};

/** The root entry point into the Graph */
export type RootQueryTermsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToTermNodeConnectionWhereArgs>;
};

/** The root entry point into the Graph */
export type RootQueryThemeArgs = {
  id: Scalars["ID"]["input"];
};

/** The root entry point into the Graph */
export type RootQueryThemesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The root entry point into the Graph */
export type RootQueryUserArgs = {
  id: Scalars["ID"]["input"];
  idType?: InputMaybe<UserNodeIdTypeEnum>;
};

/** The root entry point into the Graph */
export type RootQueryUserRoleArgs = {
  id: Scalars["ID"]["input"];
};

/** The root entry point into the Graph */
export type RootQueryUserRolesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The root entry point into the Graph */
export type RootQueryUsersArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<RootQueryToUserConnectionWhereArgs>;
};

/** Connection between the RootQuery type and the category type */
export type RootQueryToCategoryConnection = CategoryConnection &
  Connection & {
    __typename?: "RootQueryToCategoryConnection";
    /** Edges for the RootQueryToCategoryConnection connection */
    edges: Array<RootQueryToCategoryConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Category>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToCategoryConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToCategoryConnectionEdge = CategoryConnectionEdge &
  Edge & {
    __typename?: "RootQueryToCategoryConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Category;
  };

/** Page Info on the &quot;RootQueryToCategoryConnection&quot; */
export type RootQueryToCategoryConnectionPageInfo = CategoryConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToCategoryConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the RootQueryToCategoryConnection connection */
export type RootQueryToCategoryConnectionWhereArgs = {
  /** Unique cache key to be produced when this query is stored in an object cache. Default is 'core'. */
  cacheDomain?: InputMaybe<Scalars["String"]["input"]>;
  /** Term ID to retrieve child terms of. If multiple taxonomies are passed, $child_of is ignored. Default 0. */
  childOf?: InputMaybe<Scalars["Int"]["input"]>;
  /** True to limit results to terms that have no children. This parameter has no effect on non-hierarchical taxonomies. Default false. */
  childless?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Retrieve terms where the description is LIKE the input value. Default empty. */
  descriptionLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of term ids to exclude. If $include is non-empty, $exclude is ignored. Default empty array. */
  exclude?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term ids to exclude along with all of their descendant terms. If $include is non-empty, $exclude_tree is ignored. Default empty array. */
  excludeTree?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to hide terms not assigned to any posts. Accepts true or false. Default false */
  hideEmpty?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Whether to include terms that have non-empty descendants (even if $hide_empty is set to true). Default true. */
  hierarchical?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Array of term ids to include. Default empty array. */
  include?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of names to return term(s) for. Default empty. */
  name?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Retrieve terms where the name is LIKE the input value. Default empty. */
  nameLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of object IDs. Results will be limited to terms associated with these objects. */
  objectIds?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Direction the connection should be ordered in */
  order?: InputMaybe<OrderEnum>;
  /** Field(s) to order terms by. Defaults to 'name'. */
  orderby?: InputMaybe<TermObjectsConnectionOrderbyEnum>;
  /** Whether to pad the quantity of a term's children in the quantity of each term's "count" object variable. Default false. */
  padCounts?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Parent term ID to retrieve direct-child terms of. Default empty. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Search criteria to match terms. Will be SQL-formatted with wildcards before and after. Default empty. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of slugs to return term(s) for. Default empty. */
  slug?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomyId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to prime meta caches for matched terms. Default true. */
  updateTermMetaCache?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** Connection between the RootQuery type and the Comment type */
export type RootQueryToCommentConnection = CommentConnection &
  Connection & {
    __typename?: "RootQueryToCommentConnection";
    /** Edges for the RootQueryToCommentConnection connection */
    edges: Array<RootQueryToCommentConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Comment>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToCommentConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToCommentConnectionEdge = CommentConnectionEdge &
  Edge & {
    __typename?: "RootQueryToCommentConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Comment;
  };

/** Page Info on the &quot;RootQueryToCommentConnection&quot; */
export type RootQueryToCommentConnectionPageInfo = CommentConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToCommentConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the RootQueryToCommentConnection connection */
export type RootQueryToCommentConnectionWhereArgs = {
  /** Comment author email address. */
  authorEmail?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of author IDs to include comments for. */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to exclude comments for. */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Comment author URL. */
  authorUrl?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of comment IDs to include. */
  commentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of IDs of users whose unapproved comments will be returned by the query regardless of status. */
  commentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Include comments of a given type. */
  commentType?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments from a given array of comment types. */
  commentTypeIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Exclude comments from a given array of comment types. */
  commentTypeNotIn?: InputMaybe<Scalars["String"]["input"]>;
  /** Content object author ID to limit results by. */
  contentAuthor?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to retrieve comments for. */
  contentAuthorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs *not* to retrieve comments for. */
  contentAuthorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Limit results to those affiliated with a given content object ID. */
  contentId?: InputMaybe<Scalars["ID"]["input"]>;
  /** Array of content object IDs to include affiliated comments for. */
  contentIdIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of content object IDs to exclude affiliated comments for. */
  contentIdNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Content object name (i.e. slug ) to retrieve affiliated comments for. */
  contentName?: InputMaybe<Scalars["String"]["input"]>;
  /** Content Object parent ID to retrieve affiliated comments for. */
  contentParent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of content object statuses to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentStatus?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Content object type or array of types to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentType?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Array of IDs or email addresses of users whose unapproved comments will be returned by the query regardless of $status. Default empty */
  includeUnapproved?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Karma score to retrieve matching comments for. */
  karma?: InputMaybe<Scalars["Int"]["input"]>;
  /** The cardinality of the order of the connection */
  order?: InputMaybe<OrderEnum>;
  /** Field to order the comments by. */
  orderby?: InputMaybe<CommentsConnectionOrderbyEnum>;
  /** Parent ID of comment to retrieve children of. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of parent IDs of comments to retrieve children for. */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of parent IDs of comments *not* to retrieve children for. */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Search term(s) to retrieve matching comments for. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Comment status to limit results by. */
  status?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments for a specific user ID. */
  userId?: InputMaybe<Scalars["ID"]["input"]>;
};

/** Connection between the RootQuery type and the ContentNode type */
export type RootQueryToContentNodeConnection = Connection &
  ContentNodeConnection & {
    __typename?: "RootQueryToContentNodeConnection";
    /** Edges for the RootQueryToContentNodeConnection connection */
    edges: Array<RootQueryToContentNodeConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<ContentNode>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToContentNodeConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToContentNodeConnectionEdge = ContentNodeConnectionEdge &
  Edge & {
    __typename?: "RootQueryToContentNodeConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: ContentNode;
  };

/** Page Info on the &quot;RootQueryToContentNodeConnection&quot; */
export type RootQueryToContentNodeConnectionPageInfo =
  ContentNodeConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "RootQueryToContentNodeConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Arguments for filtering the RootQueryToContentNodeConnection connection */
export type RootQueryToContentNodeConnectionWhereArgs = {
  /** The Types of content to filter */
  contentTypes?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the RootQuery type and the ContentType type */
export type RootQueryToContentTypeConnection = Connection &
  ContentTypeConnection & {
    __typename?: "RootQueryToContentTypeConnection";
    /** Edges for the RootQueryToContentTypeConnection connection */
    edges: Array<RootQueryToContentTypeConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<ContentType>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToContentTypeConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToContentTypeConnectionEdge = ContentTypeConnectionEdge &
  Edge & {
    __typename?: "RootQueryToContentTypeConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: ContentType;
  };

/** Page Info on the &quot;RootQueryToContentTypeConnection&quot; */
export type RootQueryToContentTypeConnectionPageInfo =
  ContentTypeConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "RootQueryToContentTypeConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Connection between the RootQuery type and the EnqueuedScript type */
export type RootQueryToEnqueuedScriptConnection = Connection &
  EnqueuedScriptConnection & {
    __typename?: "RootQueryToEnqueuedScriptConnection";
    /** Edges for the RootQueryToEnqueuedScriptConnection connection */
    edges: Array<RootQueryToEnqueuedScriptConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<EnqueuedScript>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToEnqueuedScriptConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToEnqueuedScriptConnectionEdge = Edge &
  EnqueuedScriptConnectionEdge & {
    __typename?: "RootQueryToEnqueuedScriptConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: EnqueuedScript;
  };

/** Page Info on the &quot;RootQueryToEnqueuedScriptConnection&quot; */
export type RootQueryToEnqueuedScriptConnectionPageInfo =
  EnqueuedScriptConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "RootQueryToEnqueuedScriptConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Connection between the RootQuery type and the EnqueuedStylesheet type */
export type RootQueryToEnqueuedStylesheetConnection = Connection &
  EnqueuedStylesheetConnection & {
    __typename?: "RootQueryToEnqueuedStylesheetConnection";
    /** Edges for the RootQueryToEnqueuedStylesheetConnection connection */
    edges: Array<RootQueryToEnqueuedStylesheetConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<EnqueuedStylesheet>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToEnqueuedStylesheetConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToEnqueuedStylesheetConnectionEdge = Edge &
  EnqueuedStylesheetConnectionEdge & {
    __typename?: "RootQueryToEnqueuedStylesheetConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: EnqueuedStylesheet;
  };

/** Page Info on the &quot;RootQueryToEnqueuedStylesheetConnection&quot; */
export type RootQueryToEnqueuedStylesheetConnectionPageInfo =
  EnqueuedStylesheetConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "RootQueryToEnqueuedStylesheetConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Connection between the RootQuery type and the mediaItem type */
export type RootQueryToMediaItemConnection = Connection &
  MediaItemConnection & {
    __typename?: "RootQueryToMediaItemConnection";
    /** Edges for the RootQueryToMediaItemConnection connection */
    edges: Array<RootQueryToMediaItemConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<MediaItem>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToMediaItemConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToMediaItemConnectionEdge = Edge &
  MediaItemConnectionEdge & {
    __typename?: "RootQueryToMediaItemConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: MediaItem;
  };

/** Page Info on the &quot;RootQueryToMediaItemConnection&quot; */
export type RootQueryToMediaItemConnectionPageInfo =
  MediaItemConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "RootQueryToMediaItemConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Arguments for filtering the RootQueryToMediaItemConnection connection */
export type RootQueryToMediaItemConnectionWhereArgs = {
  /** The user that's connected as the author of the object. Use the userId for the author object. */
  author?: InputMaybe<Scalars["Int"]["input"]>;
  /** Find objects connected to author(s) in the array of author's userIds */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Find objects connected to the author by the author's nicename */
  authorName?: InputMaybe<Scalars["String"]["input"]>;
  /** Find objects NOT connected to author(s) in the array of author's userIds */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the RootQuery type and the Menu type */
export type RootQueryToMenuConnection = Connection &
  MenuConnection & {
    __typename?: "RootQueryToMenuConnection";
    /** Edges for the RootQueryToMenuConnection connection */
    edges: Array<RootQueryToMenuConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Menu>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToMenuConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToMenuConnectionEdge = Edge &
  MenuConnectionEdge & {
    __typename?: "RootQueryToMenuConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Menu;
  };

/** Page Info on the &quot;RootQueryToMenuConnection&quot; */
export type RootQueryToMenuConnectionPageInfo = MenuConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToMenuConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the RootQueryToMenuConnection connection */
export type RootQueryToMenuConnectionWhereArgs = {
  /** The database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** The menu location for the menu being queried */
  location?: InputMaybe<MenuLocationEnum>;
  /** The slug of the menu to query items for */
  slug?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the RootQuery type and the MenuItem type */
export type RootQueryToMenuItemConnection = Connection &
  MenuItemConnection & {
    __typename?: "RootQueryToMenuItemConnection";
    /** Edges for the RootQueryToMenuItemConnection connection */
    edges: Array<RootQueryToMenuItemConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<MenuItem>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToMenuItemConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToMenuItemConnectionEdge = Edge &
  MenuItemConnectionEdge & {
    __typename?: "RootQueryToMenuItemConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: MenuItem;
  };

/** Page Info on the &quot;RootQueryToMenuItemConnection&quot; */
export type RootQueryToMenuItemConnectionPageInfo = MenuItemConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToMenuItemConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the RootQueryToMenuItemConnection connection */
export type RootQueryToMenuItemConnectionWhereArgs = {
  /** The database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** The menu location for the menu being queried */
  location?: InputMaybe<MenuLocationEnum>;
  /** The database ID of the parent menu object */
  parentDatabaseId?: InputMaybe<Scalars["Int"]["input"]>;
  /** The ID of the parent menu object */
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
};

/** Connection between the RootQuery type and the page type */
export type RootQueryToPageConnection = Connection &
  PageConnection & {
    __typename?: "RootQueryToPageConnection";
    /** Edges for the RootQueryToPageConnection connection */
    edges: Array<RootQueryToPageConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Page>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToPageConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToPageConnectionEdge = Edge &
  PageConnectionEdge & {
    __typename?: "RootQueryToPageConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Page;
  };

/** Page Info on the &quot;RootQueryToPageConnection&quot; */
export type RootQueryToPageConnectionPageInfo = PageConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToPageConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the RootQueryToPageConnection connection */
export type RootQueryToPageConnectionWhereArgs = {
  /** The user that's connected as the author of the object. Use the userId for the author object. */
  author?: InputMaybe<Scalars["Int"]["input"]>;
  /** Find objects connected to author(s) in the array of author's userIds */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Find objects connected to the author by the author's nicename */
  authorName?: InputMaybe<Scalars["String"]["input"]>;
  /** Find objects NOT connected to author(s) in the array of author's userIds */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the RootQuery type and the Plugin type */
export type RootQueryToPluginConnection = Connection &
  PluginConnection & {
    __typename?: "RootQueryToPluginConnection";
    /** Edges for the RootQueryToPluginConnection connection */
    edges: Array<RootQueryToPluginConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Plugin>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToPluginConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToPluginConnectionEdge = Edge &
  PluginConnectionEdge & {
    __typename?: "RootQueryToPluginConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Plugin;
  };

/** Page Info on the &quot;RootQueryToPluginConnection&quot; */
export type RootQueryToPluginConnectionPageInfo = PageInfo &
  PluginConnectionPageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToPluginConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the RootQueryToPluginConnection connection */
export type RootQueryToPluginConnectionWhereArgs = {
  /** Show plugin based on a keyword search. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve plugins where plugin status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PluginStatusEnum>>>;
  /** Show plugins with a specific status. */
  status?: InputMaybe<PluginStatusEnum>;
};

/** Connection between the RootQuery type and the post type */
export type RootQueryToPostConnection = Connection &
  PostConnection & {
    __typename?: "RootQueryToPostConnection";
    /** Edges for the RootQueryToPostConnection connection */
    edges: Array<RootQueryToPostConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Post>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToPostConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToPostConnectionEdge = Edge &
  PostConnectionEdge & {
    __typename?: "RootQueryToPostConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Post;
  };

/** Page Info on the &quot;RootQueryToPostConnection&quot; */
export type RootQueryToPostConnectionPageInfo = PageInfo &
  PostConnectionPageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToPostConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the RootQueryToPostConnection connection */
export type RootQueryToPostConnectionWhereArgs = {
  /** The user that's connected as the author of the object. Use the userId for the author object. */
  author?: InputMaybe<Scalars["Int"]["input"]>;
  /** Find objects connected to author(s) in the array of author's userIds */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Find objects connected to the author by the author's nicename */
  authorName?: InputMaybe<Scalars["String"]["input"]>;
  /** Find objects NOT connected to author(s) in the array of author's userIds */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Category ID */
  categoryId?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of category IDs, used to display objects from one category OR another */
  categoryIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Use Category Slug */
  categoryName?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of category IDs, used to display objects from one category OR another */
  categoryNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Tag Slug */
  tag?: InputMaybe<Scalars["String"]["input"]>;
  /** Use Tag ID */
  tagId?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of tag IDs, used to display objects from one tag OR another */
  tagIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of tag IDs, used to display objects from one tag OR another */
  tagNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of tag slugs, used to display objects from one tag AND another */
  tagSlugAnd?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Array of tag slugs, used to include objects in ANY specified tags */
  tagSlugIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the RootQuery type and the postFormat type */
export type RootQueryToPostFormatConnection = Connection &
  PostFormatConnection & {
    __typename?: "RootQueryToPostFormatConnection";
    /** Edges for the RootQueryToPostFormatConnection connection */
    edges: Array<RootQueryToPostFormatConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<PostFormat>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToPostFormatConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToPostFormatConnectionEdge = Edge &
  PostFormatConnectionEdge & {
    __typename?: "RootQueryToPostFormatConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: PostFormat;
  };

/** Page Info on the &quot;RootQueryToPostFormatConnection&quot; */
export type RootQueryToPostFormatConnectionPageInfo = PageInfo &
  PostFormatConnectionPageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToPostFormatConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the RootQueryToPostFormatConnection connection */
export type RootQueryToPostFormatConnectionWhereArgs = {
  /** Unique cache key to be produced when this query is stored in an object cache. Default is 'core'. */
  cacheDomain?: InputMaybe<Scalars["String"]["input"]>;
  /** Term ID to retrieve child terms of. If multiple taxonomies are passed, $child_of is ignored. Default 0. */
  childOf?: InputMaybe<Scalars["Int"]["input"]>;
  /** True to limit results to terms that have no children. This parameter has no effect on non-hierarchical taxonomies. Default false. */
  childless?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Retrieve terms where the description is LIKE the input value. Default empty. */
  descriptionLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of term ids to exclude. If $include is non-empty, $exclude is ignored. Default empty array. */
  exclude?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term ids to exclude along with all of their descendant terms. If $include is non-empty, $exclude_tree is ignored. Default empty array. */
  excludeTree?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to hide terms not assigned to any posts. Accepts true or false. Default false */
  hideEmpty?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Whether to include terms that have non-empty descendants (even if $hide_empty is set to true). Default true. */
  hierarchical?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Array of term ids to include. Default empty array. */
  include?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of names to return term(s) for. Default empty. */
  name?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Retrieve terms where the name is LIKE the input value. Default empty. */
  nameLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of object IDs. Results will be limited to terms associated with these objects. */
  objectIds?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Direction the connection should be ordered in */
  order?: InputMaybe<OrderEnum>;
  /** Field(s) to order terms by. Defaults to 'name'. */
  orderby?: InputMaybe<TermObjectsConnectionOrderbyEnum>;
  /** Whether to pad the quantity of a term's children in the quantity of each term's "count" object variable. Default false. */
  padCounts?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Parent term ID to retrieve direct-child terms of. Default empty. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Search criteria to match terms. Will be SQL-formatted with wildcards before and after. Default empty. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of slugs to return term(s) for. Default empty. */
  slug?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomyId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to prime meta caches for matched terms. Default true. */
  updateTermMetaCache?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** Connection between the RootQuery type and the ContentNode type */
export type RootQueryToRevisionsConnection = Connection &
  ContentNodeConnection & {
    __typename?: "RootQueryToRevisionsConnection";
    /** Edges for the RootQueryToRevisionsConnection connection */
    edges: Array<RootQueryToRevisionsConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<ContentNode>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToRevisionsConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToRevisionsConnectionEdge = ContentNodeConnectionEdge &
  Edge & {
    __typename?: "RootQueryToRevisionsConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: ContentNode;
  };

/** Page Info on the &quot;RootQueryToRevisionsConnection&quot; */
export type RootQueryToRevisionsConnectionPageInfo =
  ContentNodeConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "RootQueryToRevisionsConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Arguments for filtering the RootQueryToRevisionsConnection connection */
export type RootQueryToRevisionsConnectionWhereArgs = {
  /** The Types of content to filter */
  contentTypes?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the RootQuery type and the tag type */
export type RootQueryToTagConnection = Connection &
  TagConnection & {
    __typename?: "RootQueryToTagConnection";
    /** Edges for the RootQueryToTagConnection connection */
    edges: Array<RootQueryToTagConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Tag>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToTagConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToTagConnectionEdge = Edge &
  TagConnectionEdge & {
    __typename?: "RootQueryToTagConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Tag;
  };

/** Page Info on the &quot;RootQueryToTagConnection&quot; */
export type RootQueryToTagConnectionPageInfo = PageInfo &
  TagConnectionPageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToTagConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the RootQueryToTagConnection connection */
export type RootQueryToTagConnectionWhereArgs = {
  /** Unique cache key to be produced when this query is stored in an object cache. Default is 'core'. */
  cacheDomain?: InputMaybe<Scalars["String"]["input"]>;
  /** Term ID to retrieve child terms of. If multiple taxonomies are passed, $child_of is ignored. Default 0. */
  childOf?: InputMaybe<Scalars["Int"]["input"]>;
  /** True to limit results to terms that have no children. This parameter has no effect on non-hierarchical taxonomies. Default false. */
  childless?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Retrieve terms where the description is LIKE the input value. Default empty. */
  descriptionLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of term ids to exclude. If $include is non-empty, $exclude is ignored. Default empty array. */
  exclude?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term ids to exclude along with all of their descendant terms. If $include is non-empty, $exclude_tree is ignored. Default empty array. */
  excludeTree?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to hide terms not assigned to any posts. Accepts true or false. Default false */
  hideEmpty?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Whether to include terms that have non-empty descendants (even if $hide_empty is set to true). Default true. */
  hierarchical?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Array of term ids to include. Default empty array. */
  include?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of names to return term(s) for. Default empty. */
  name?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Retrieve terms where the name is LIKE the input value. Default empty. */
  nameLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of object IDs. Results will be limited to terms associated with these objects. */
  objectIds?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Direction the connection should be ordered in */
  order?: InputMaybe<OrderEnum>;
  /** Field(s) to order terms by. Defaults to 'name'. */
  orderby?: InputMaybe<TermObjectsConnectionOrderbyEnum>;
  /** Whether to pad the quantity of a term's children in the quantity of each term's "count" object variable. Default false. */
  padCounts?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Parent term ID to retrieve direct-child terms of. Default empty. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Search criteria to match terms. Will be SQL-formatted with wildcards before and after. Default empty. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of slugs to return term(s) for. Default empty. */
  slug?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomyId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to prime meta caches for matched terms. Default true. */
  updateTermMetaCache?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** Connection between the RootQuery type and the Taxonomy type */
export type RootQueryToTaxonomyConnection = Connection &
  TaxonomyConnection & {
    __typename?: "RootQueryToTaxonomyConnection";
    /** Edges for the RootQueryToTaxonomyConnection connection */
    edges: Array<RootQueryToTaxonomyConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Taxonomy>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToTaxonomyConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToTaxonomyConnectionEdge = Edge &
  TaxonomyConnectionEdge & {
    __typename?: "RootQueryToTaxonomyConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Taxonomy;
  };

/** Page Info on the &quot;RootQueryToTaxonomyConnection&quot; */
export type RootQueryToTaxonomyConnectionPageInfo = PageInfo &
  TaxonomyConnectionPageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToTaxonomyConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Connection between the RootQuery type and the TermNode type */
export type RootQueryToTermNodeConnection = Connection &
  TermNodeConnection & {
    __typename?: "RootQueryToTermNodeConnection";
    /** Edges for the RootQueryToTermNodeConnection connection */
    edges: Array<RootQueryToTermNodeConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<TermNode>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToTermNodeConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToTermNodeConnectionEdge = Edge &
  TermNodeConnectionEdge & {
    __typename?: "RootQueryToTermNodeConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: TermNode;
  };

/** Page Info on the &quot;RootQueryToTermNodeConnection&quot; */
export type RootQueryToTermNodeConnectionPageInfo = PageInfo &
  TermNodeConnectionPageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToTermNodeConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the RootQueryToTermNodeConnection connection */
export type RootQueryToTermNodeConnectionWhereArgs = {
  /** Unique cache key to be produced when this query is stored in an object cache. Default is 'core'. */
  cacheDomain?: InputMaybe<Scalars["String"]["input"]>;
  /** Term ID to retrieve child terms of. If multiple taxonomies are passed, $child_of is ignored. Default 0. */
  childOf?: InputMaybe<Scalars["Int"]["input"]>;
  /** True to limit results to terms that have no children. This parameter has no effect on non-hierarchical taxonomies. Default false. */
  childless?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Retrieve terms where the description is LIKE the input value. Default empty. */
  descriptionLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of term ids to exclude. If $include is non-empty, $exclude is ignored. Default empty array. */
  exclude?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term ids to exclude along with all of their descendant terms. If $include is non-empty, $exclude_tree is ignored. Default empty array. */
  excludeTree?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to hide terms not assigned to any posts. Accepts true or false. Default false */
  hideEmpty?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Whether to include terms that have non-empty descendants (even if $hide_empty is set to true). Default true. */
  hierarchical?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Array of term ids to include. Default empty array. */
  include?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of names to return term(s) for. Default empty. */
  name?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Retrieve terms where the name is LIKE the input value. Default empty. */
  nameLike?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of object IDs. Results will be limited to terms associated with these objects. */
  objectIds?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Direction the connection should be ordered in */
  order?: InputMaybe<OrderEnum>;
  /** Field(s) to order terms by. Defaults to 'name'. */
  orderby?: InputMaybe<TermObjectsConnectionOrderbyEnum>;
  /** Whether to pad the quantity of a term's children in the quantity of each term's "count" object variable. Default false. */
  padCounts?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Parent term ID to retrieve direct-child terms of. Default empty. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Search criteria to match terms. Will be SQL-formatted with wildcards before and after. Default empty. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of slugs to return term(s) for. Default empty. */
  slug?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** The Taxonomy to filter terms by */
  taxonomies?: InputMaybe<Array<InputMaybe<TaxonomyEnum>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of term taxonomy IDs, to match when querying terms. */
  termTaxonomyId?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Whether to prime meta caches for matched terms. Default true. */
  updateTermMetaCache?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** Connection between the RootQuery type and the Theme type */
export type RootQueryToThemeConnection = Connection &
  ThemeConnection & {
    __typename?: "RootQueryToThemeConnection";
    /** Edges for the RootQueryToThemeConnection connection */
    edges: Array<RootQueryToThemeConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Theme>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToThemeConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToThemeConnectionEdge = Edge &
  ThemeConnectionEdge & {
    __typename?: "RootQueryToThemeConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Theme;
  };

/** Page Info on the &quot;RootQueryToThemeConnection&quot; */
export type RootQueryToThemeConnectionPageInfo = PageInfo &
  ThemeConnectionPageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToThemeConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Connection between the RootQuery type and the User type */
export type RootQueryToUserConnection = Connection &
  UserConnection & {
    __typename?: "RootQueryToUserConnection";
    /** Edges for the RootQueryToUserConnection connection */
    edges: Array<RootQueryToUserConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<User>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToUserConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToUserConnectionEdge = Edge &
  UserConnectionEdge & {
    __typename?: "RootQueryToUserConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: User;
  };

/** Page Info on the &quot;RootQueryToUserConnection&quot; */
export type RootQueryToUserConnectionPageInfo = PageInfo &
  UserConnectionPageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToUserConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the RootQueryToUserConnection connection */
export type RootQueryToUserConnectionWhereArgs = {
  /** Array of userIds to exclude. */
  exclude?: InputMaybe<Array<InputMaybe<Scalars["Int"]["input"]>>>;
  /** Pass an array of post types to filter results to users who have published posts in those post types. */
  hasPublishedPosts?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Array of userIds to include. */
  include?: InputMaybe<Array<InputMaybe<Scalars["Int"]["input"]>>>;
  /** The user login. */
  login?: InputMaybe<Scalars["String"]["input"]>;
  /** An array of logins to include. Users matching one of these logins will be included in results. */
  loginIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** An array of logins to exclude. Users matching one of these logins will not be included in results. */
  loginNotIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** The user nicename. */
  nicename?: InputMaybe<Scalars["String"]["input"]>;
  /** An array of nicenames to include. Users matching one of these nicenames will be included in results. */
  nicenameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** An array of nicenames to exclude. Users matching one of these nicenames will not be included in results. */
  nicenameNotIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<UsersConnectionOrderbyInput>>>;
  /** An array of role names that users must match to be included in results. Note that this is an inclusive list: users must match *each* role. */
  role?: InputMaybe<UserRoleEnum>;
  /** An array of role names. Matched users must have at least one of these roles. */
  roleIn?: InputMaybe<Array<InputMaybe<UserRoleEnum>>>;
  /** An array of role names to exclude. Users matching one or more of these roles will not be included in results. */
  roleNotIn?: InputMaybe<Array<InputMaybe<UserRoleEnum>>>;
  /** Search keyword. Searches for possible string matches on columns. When "searchColumns" is left empty, it tries to determine which column to search in based on search string. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of column names to be searched. Accepts 'ID', 'login', 'nicename', 'email', 'url'. */
  searchColumns?: InputMaybe<
    Array<InputMaybe<UsersConnectionSearchColumnEnum>>
  >;
};

/** Connection between the RootQuery type and the UserRole type */
export type RootQueryToUserRoleConnection = Connection &
  UserRoleConnection & {
    __typename?: "RootQueryToUserRoleConnection";
    /** Edges for the RootQueryToUserRoleConnection connection */
    edges: Array<RootQueryToUserRoleConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<UserRole>;
    /** Information about pagination in a connection. */
    pageInfo: RootQueryToUserRoleConnectionPageInfo;
  };

/** An edge in a connection */
export type RootQueryToUserRoleConnectionEdge = Edge &
  UserRoleConnectionEdge & {
    __typename?: "RootQueryToUserRoleConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: UserRole;
  };

/** Page Info on the &quot;RootQueryToUserRoleConnection&quot; */
export type RootQueryToUserRoleConnectionPageInfo = PageInfo &
  UserRoleConnectionPageInfo &
  WpPageInfo & {
    __typename?: "RootQueryToUserRoleConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** The Yoast SEO breadcrumb config */
export type SeoBreadcrumbs = {
  __typename?: "SEOBreadcrumbs";
  archivePrefix?: Maybe<Scalars["String"]["output"]>;
  boldLast?: Maybe<Scalars["Boolean"]["output"]>;
  enabled?: Maybe<Scalars["Boolean"]["output"]>;
  homeText?: Maybe<Scalars["String"]["output"]>;
  notFoundText?: Maybe<Scalars["String"]["output"]>;
  prefix?: Maybe<Scalars["String"]["output"]>;
  searchPrefix?: Maybe<Scalars["String"]["output"]>;
  separator?: Maybe<Scalars["String"]["output"]>;
  showBlogPage?: Maybe<Scalars["Boolean"]["output"]>;
};

/** Types of cards */
export enum SeoCardType {
  Summary = "summary",
  SummaryLargeImage = "summary_large_image",
}

/** The Yoast SEO site level configuration data */
export type SeoConfig = {
  __typename?: "SEOConfig";
  breadcrumbs?: Maybe<SeoBreadcrumbs>;
  contentTypes?: Maybe<SeoContentTypes>;
  meta?: Maybe<SeoGlobalMeta>;
  openGraph?: Maybe<SeoOpenGraph>;
  redirects?: Maybe<Array<Maybe<SeoRedirect>>>;
  schema?: Maybe<SeoSchema>;
  social?: Maybe<SeoSocial>;
  webmaster?: Maybe<SeoWebmaster>;
};

/** The Yoast SEO search appearance content types fields */
export type SeoContentType = {
  __typename?: "SEOContentType";
  archive?: Maybe<SeoContentTypeArchive>;
  metaDesc?: Maybe<Scalars["String"]["output"]>;
  metaRobotsNoindex?: Maybe<Scalars["Boolean"]["output"]>;
  schema?: Maybe<SeoPageInfoSchema>;
  schemaType?: Maybe<Scalars["String"]["output"]>;
  title?: Maybe<Scalars["String"]["output"]>;
};

/** The Yoast SEO search appearance content types fields */
export type SeoContentTypeArchive = {
  __typename?: "SEOContentTypeArchive";
  archiveLink?: Maybe<Scalars["String"]["output"]>;
  breadcrumbTitle?: Maybe<Scalars["String"]["output"]>;
  fullHead?: Maybe<Scalars["String"]["output"]>;
  hasArchive?: Maybe<Scalars["Boolean"]["output"]>;
  metaDesc?: Maybe<Scalars["String"]["output"]>;
  metaRobotsFollow?: Maybe<Scalars["String"]["output"]>;
  metaRobotsIndex?: Maybe<Scalars["String"]["output"]>;
  metaRobotsNofollow?: Maybe<Scalars["Boolean"]["output"]>;
  metaRobotsNoindex?: Maybe<Scalars["Boolean"]["output"]>;
  title?: Maybe<Scalars["String"]["output"]>;
};

/** The Yoast SEO search appearance content types */
export type SeoContentTypes = {
  __typename?: "SEOContentTypes";
  mediaItem?: Maybe<SeoContentType>;
  page?: Maybe<SeoContentType>;
  post?: Maybe<SeoContentType>;
};

/** The Yoast SEO meta data */
export type SeoGlobalMeta = {
  __typename?: "SEOGlobalMeta";
  author?: Maybe<SeoGlobalMetaAuthor>;
  config?: Maybe<SeoGlobalMetaConfig>;
  date?: Maybe<SeoGlobalMetaDate>;
  homepage?: Maybe<SeoGlobalMetaHome>;
  notFound?: Maybe<SeoGlobalMeta404>;
};

/** The Yoast SEO meta 404 data */
export type SeoGlobalMeta404 = {
  __typename?: "SEOGlobalMeta404";
  breadcrumb?: Maybe<Scalars["String"]["output"]>;
  title?: Maybe<Scalars["String"]["output"]>;
};

/** The Yoast SEO Author data */
export type SeoGlobalMetaAuthor = {
  __typename?: "SEOGlobalMetaAuthor";
  description?: Maybe<Scalars["String"]["output"]>;
  title?: Maybe<Scalars["String"]["output"]>;
};

/** The Yoast SEO meta config data */
export type SeoGlobalMetaConfig = {
  __typename?: "SEOGlobalMetaConfig";
  separator?: Maybe<Scalars["String"]["output"]>;
};

/** The Yoast SEO Date data */
export type SeoGlobalMetaDate = {
  __typename?: "SEOGlobalMetaDate";
  description?: Maybe<Scalars["String"]["output"]>;
  title?: Maybe<Scalars["String"]["output"]>;
};

/** The Yoast SEO homepage data */
export type SeoGlobalMetaHome = {
  __typename?: "SEOGlobalMetaHome";
  description?: Maybe<Scalars["String"]["output"]>;
  title?: Maybe<Scalars["String"]["output"]>;
};

/** The Open Graph data */
export type SeoOpenGraph = {
  __typename?: "SEOOpenGraph";
  defaultImage?: Maybe<MediaItem>;
  frontPage?: Maybe<SeoOpenGraphFrontPage>;
};

/** The Open Graph Front page data */
export type SeoOpenGraphFrontPage = {
  __typename?: "SEOOpenGraphFrontPage";
  description?: Maybe<Scalars["String"]["output"]>;
  image?: Maybe<MediaItem>;
  title?: Maybe<Scalars["String"]["output"]>;
};

/** The Schema for post type */
export type SeoPageInfoSchema = {
  __typename?: "SEOPageInfoSchema";
  raw?: Maybe<Scalars["String"]["output"]>;
};

export type SeoPostTypeBreadcrumbs = {
  __typename?: "SEOPostTypeBreadcrumbs";
  text?: Maybe<Scalars["String"]["output"]>;
  url?: Maybe<Scalars["String"]["output"]>;
};

/** The page info SEO details */
export type SeoPostTypePageInfo = {
  __typename?: "SEOPostTypePageInfo";
  schema?: Maybe<SeoPageInfoSchema>;
};

/** The Schema types */
export type SeoPostTypeSchema = {
  __typename?: "SEOPostTypeSchema";
  articleType?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
  pageType?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
  raw?: Maybe<Scalars["String"]["output"]>;
};

/** The Yoast redirect data  (Yoast Premium only) */
export type SeoRedirect = {
  __typename?: "SEORedirect";
  format?: Maybe<Scalars["String"]["output"]>;
  origin?: Maybe<Scalars["String"]["output"]>;
  target?: Maybe<Scalars["String"]["output"]>;
  type?: Maybe<Scalars["Int"]["output"]>;
};

/** The Yoast SEO schema data */
export type SeoSchema = {
  __typename?: "SEOSchema";
  companyLogo?: Maybe<MediaItem>;
  companyName?: Maybe<Scalars["String"]["output"]>;
  companyOrPerson?: Maybe<Scalars["String"]["output"]>;
  homeUrl?: Maybe<Scalars["String"]["output"]>;
  inLanguage?: Maybe<Scalars["String"]["output"]>;
  logo?: Maybe<MediaItem>;
  personLogo?: Maybe<MediaItem>;
  personName?: Maybe<Scalars["String"]["output"]>;
  siteName?: Maybe<Scalars["String"]["output"]>;
  siteUrl?: Maybe<Scalars["String"]["output"]>;
  wordpressSiteName?: Maybe<Scalars["String"]["output"]>;
};

/** The Yoast SEO Social media links */
export type SeoSocial = {
  __typename?: "SEOSocial";
  facebook?: Maybe<SeoSocialFacebook>;
  instagram?: Maybe<SeoSocialInstagram>;
  linkedIn?: Maybe<SeoSocialLinkedIn>;
  mySpace?: Maybe<SeoSocialMySpace>;
  otherSocials?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
  pinterest?: Maybe<SeoSocialPinterest>;
  twitter?: Maybe<SeoSocialTwitter>;
  wikipedia?: Maybe<SeoSocialWikipedia>;
  youTube?: Maybe<SeoSocialYoutube>;
};

export type SeoSocialFacebook = {
  __typename?: "SEOSocialFacebook";
  defaultImage?: Maybe<MediaItem>;
  url?: Maybe<Scalars["String"]["output"]>;
};

export type SeoSocialInstagram = {
  __typename?: "SEOSocialInstagram";
  url?: Maybe<Scalars["String"]["output"]>;
};

export type SeoSocialLinkedIn = {
  __typename?: "SEOSocialLinkedIn";
  url?: Maybe<Scalars["String"]["output"]>;
};

export type SeoSocialMySpace = {
  __typename?: "SEOSocialMySpace";
  url?: Maybe<Scalars["String"]["output"]>;
};

export type SeoSocialPinterest = {
  __typename?: "SEOSocialPinterest";
  metaTag?: Maybe<Scalars["String"]["output"]>;
  url?: Maybe<Scalars["String"]["output"]>;
};

export type SeoSocialTwitter = {
  __typename?: "SEOSocialTwitter";
  cardType?: Maybe<SeoCardType>;
  username?: Maybe<Scalars["String"]["output"]>;
};

export type SeoSocialWikipedia = {
  __typename?: "SEOSocialWikipedia";
  url?: Maybe<Scalars["String"]["output"]>;
};

export type SeoSocialYoutube = {
  __typename?: "SEOSocialYoutube";
  url?: Maybe<Scalars["String"]["output"]>;
};

/** The Schema types for Taxonomy */
export type SeoTaxonomySchema = {
  __typename?: "SEOTaxonomySchema";
  raw?: Maybe<Scalars["String"]["output"]>;
};

export type SeoUser = {
  __typename?: "SEOUser";
  breadcrumbTitle?: Maybe<Scalars["String"]["output"]>;
  canonical?: Maybe<Scalars["String"]["output"]>;
  fullHead?: Maybe<Scalars["String"]["output"]>;
  language?: Maybe<Scalars["String"]["output"]>;
  metaDesc?: Maybe<Scalars["String"]["output"]>;
  metaRobotsNofollow?: Maybe<Scalars["String"]["output"]>;
  metaRobotsNoindex?: Maybe<Scalars["String"]["output"]>;
  opengraphDescription?: Maybe<Scalars["String"]["output"]>;
  opengraphImage?: Maybe<MediaItem>;
  opengraphTitle?: Maybe<Scalars["String"]["output"]>;
  region?: Maybe<Scalars["String"]["output"]>;
  schema?: Maybe<SeoUserSchema>;
  social?: Maybe<SeoUserSocial>;
  title?: Maybe<Scalars["String"]["output"]>;
  twitterDescription?: Maybe<Scalars["String"]["output"]>;
  twitterImage?: Maybe<MediaItem>;
  twitterTitle?: Maybe<Scalars["String"]["output"]>;
};

/** The Schema types for User */
export type SeoUserSchema = {
  __typename?: "SEOUserSchema";
  articleType?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
  pageType?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
  raw?: Maybe<Scalars["String"]["output"]>;
};

export type SeoUserSocial = {
  __typename?: "SEOUserSocial";
  facebook?: Maybe<Scalars["String"]["output"]>;
  instagram?: Maybe<Scalars["String"]["output"]>;
  linkedIn?: Maybe<Scalars["String"]["output"]>;
  mySpace?: Maybe<Scalars["String"]["output"]>;
  pinterest?: Maybe<Scalars["String"]["output"]>;
  soundCloud?: Maybe<Scalars["String"]["output"]>;
  twitter?: Maybe<Scalars["String"]["output"]>;
  wikipedia?: Maybe<Scalars["String"]["output"]>;
  youTube?: Maybe<Scalars["String"]["output"]>;
};

/** The Yoast SEO  webmaster fields */
export type SeoWebmaster = {
  __typename?: "SEOWebmaster";
  baiduVerify?: Maybe<Scalars["String"]["output"]>;
  googleVerify?: Maybe<Scalars["String"]["output"]>;
  msVerify?: Maybe<Scalars["String"]["output"]>;
  yandexVerify?: Maybe<Scalars["String"]["output"]>;
};

/** The strategy to use when loading the script */
export enum ScriptLoadingStrategyEnum {
  /** Use the script `async` attribute */
  Async = "ASYNC",
  /** Use the script `defer` attribute */
  Defer = "DEFER",
}

/** Input for the sendPasswordResetEmail mutation. */
export type SendPasswordResetEmailInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** A string that contains the user's username or email address. */
  username: Scalars["String"]["input"];
};

/** The payload for the sendPasswordResetEmail mutation. */
export type SendPasswordResetEmailPayload = {
  __typename?: "SendPasswordResetEmailPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** Whether the mutation completed successfully. This does NOT necessarily mean that an email was sent. */
  success?: Maybe<Scalars["Boolean"]["output"]>;
  /**
   * The user that the password reset email was sent to
   * @deprecated This field will be removed in a future version of WPGraphQL
   */
  user?: Maybe<User>;
};

/** All of the registered settings */
export type Settings = {
  __typename?: "Settings";
  /** Settings of the the string Settings Group */
  discussionSettingsDefaultCommentStatus?: Maybe<Scalars["String"]["output"]>;
  /** Settings of the the string Settings Group */
  discussionSettingsDefaultPingStatus?: Maybe<Scalars["String"]["output"]>;
  /** Settings of the the string Settings Group */
  generalSettingsDateFormat?: Maybe<Scalars["String"]["output"]>;
  /** Settings of the the string Settings Group */
  generalSettingsDescription?: Maybe<Scalars["String"]["output"]>;
  /** Settings of the the string Settings Group */
  generalSettingsEmail?: Maybe<Scalars["String"]["output"]>;
  /** Settings of the the string Settings Group */
  generalSettingsLanguage?: Maybe<Scalars["String"]["output"]>;
  /** Settings of the the integer Settings Group */
  generalSettingsStartOfWeek?: Maybe<Scalars["Int"]["output"]>;
  /** Settings of the the string Settings Group */
  generalSettingsTimeFormat?: Maybe<Scalars["String"]["output"]>;
  /** Settings of the the string Settings Group */
  generalSettingsTimezone?: Maybe<Scalars["String"]["output"]>;
  /** Settings of the the string Settings Group */
  generalSettingsTitle?: Maybe<Scalars["String"]["output"]>;
  /** Settings of the the string Settings Group */
  generalSettingsUrl?: Maybe<Scalars["String"]["output"]>;
  /** Settings of the the integer Settings Group */
  readingSettingsPageForPosts?: Maybe<Scalars["Int"]["output"]>;
  /** Settings of the the integer Settings Group */
  readingSettingsPageOnFront?: Maybe<Scalars["Int"]["output"]>;
  /** Settings of the the integer Settings Group */
  readingSettingsPostsPerPage?: Maybe<Scalars["Int"]["output"]>;
  /** Settings of the the string Settings Group */
  readingSettingsShowOnFront?: Maybe<Scalars["String"]["output"]>;
  /** Settings of the the integer Settings Group */
  writingSettingsDefaultCategory?: Maybe<Scalars["Int"]["output"]>;
  /** Settings of the the string Settings Group */
  writingSettingsDefaultPostFormat?: Maybe<Scalars["String"]["output"]>;
  /** Settings of the the boolean Settings Group */
  writingSettingsUseSmilies?: Maybe<Scalars["Boolean"]["output"]>;
};

/** The tag type */
export type Tag = DatabaseIdentifier &
  MenuItemLinkable &
  Node &
  TermNode &
  UniformResourceIdentifiable & {
    __typename?: "Tag";
    /** Connection between the Tag type and the ContentNode type */
    contentNodes?: Maybe<TagToContentNodeConnection>;
    /** The number of objects connected to the object */
    count?: Maybe<Scalars["Int"]["output"]>;
    /** The unique identifier stored in the database */
    databaseId: Scalars["Int"]["output"];
    /** The description of the object */
    description?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the TermNode type and the EnqueuedScript type */
    enqueuedScripts?: Maybe<TermNodeToEnqueuedScriptConnection>;
    /** Connection between the TermNode type and the EnqueuedStylesheet type */
    enqueuedStylesheets?: Maybe<TermNodeToEnqueuedStylesheetConnection>;
    /** The globally unique ID for the object */
    id: Scalars["ID"]["output"];
    /** Whether the node is a Content Node */
    isContentNode: Scalars["Boolean"]["output"];
    /** Whether the object is restricted from the current viewer */
    isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether the node is a Term */
    isTermNode: Scalars["Boolean"]["output"];
    /** The link to the term */
    link?: Maybe<Scalars["String"]["output"]>;
    /** The human friendly name of the object. */
    name?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the Tag type and the post type */
    posts?: Maybe<TagToPostConnection>;
    /** The Yoast SEO data of the Tags taxonomy. */
    seo?: Maybe<TaxonomySeo>;
    /** An alphanumeric identifier for the object unique to its type. */
    slug?: Maybe<Scalars["String"]["output"]>;
    /**
     * The id field matches the WP_Post-&gt;ID field.
     * @deprecated Deprecated in favor of databaseId
     */
    tagId?: Maybe<Scalars["Int"]["output"]>;
    /** Connection between the Tag type and the Taxonomy type */
    taxonomy?: Maybe<TagToTaxonomyConnectionEdge>;
    /** The name of the taxonomy that the object is associated with */
    taxonomyName?: Maybe<Scalars["String"]["output"]>;
    /** The ID of the term group that this term object belongs to */
    termGroupId?: Maybe<Scalars["Int"]["output"]>;
    /** The taxonomy ID that the object is associated with */
    termTaxonomyId?: Maybe<Scalars["Int"]["output"]>;
    /** The unique resource identifier path */
    uri?: Maybe<Scalars["String"]["output"]>;
  };

/** The tag type */
export type TagContentNodesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<TagToContentNodeConnectionWhereArgs>;
};

/** The tag type */
export type TagEnqueuedScriptsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The tag type */
export type TagEnqueuedStylesheetsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** The tag type */
export type TagPostsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<TagToPostConnectionWhereArgs>;
};

/** Connection to tag Nodes */
export type TagConnection = {
  /** A list of edges (relational context) between RootQuery and connected tag Nodes */
  edges: Array<TagConnectionEdge>;
  /** A list of connected tag Nodes */
  nodes: Array<Tag>;
  /** Information about pagination in a connection. */
  pageInfo: TagConnectionPageInfo;
};

/** Edge between a Node and a connected tag */
export type TagConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected tag Node */
  node: Tag;
};

/** Page Info on the connected TagConnectionEdge */
export type TagConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** The Type of Identifier used to fetch a single resource. Default is ID. */
export enum TagIdType {
  /** The Database ID for the node */
  DatabaseId = "DATABASE_ID",
  /** The hashed Global ID */
  Id = "ID",
  /** The name of the node */
  Name = "NAME",
  /** Url friendly name of the node */
  Slug = "SLUG",
  /** The URI for the node */
  Uri = "URI",
}

/** Connection between the Tag type and the ContentNode type */
export type TagToContentNodeConnection = Connection &
  ContentNodeConnection & {
    __typename?: "TagToContentNodeConnection";
    /** Edges for the TagToContentNodeConnection connection */
    edges: Array<TagToContentNodeConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<ContentNode>;
    /** Information about pagination in a connection. */
    pageInfo: TagToContentNodeConnectionPageInfo;
  };

/** An edge in a connection */
export type TagToContentNodeConnectionEdge = ContentNodeConnectionEdge &
  Edge & {
    __typename?: "TagToContentNodeConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: ContentNode;
  };

/** Page Info on the &quot;TagToContentNodeConnection&quot; */
export type TagToContentNodeConnectionPageInfo = ContentNodeConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "TagToContentNodeConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the TagToContentNodeConnection connection */
export type TagToContentNodeConnectionWhereArgs = {
  /** The Types of content to filter */
  contentTypes?: InputMaybe<Array<InputMaybe<ContentTypesOfTagEnum>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the Tag type and the post type */
export type TagToPostConnection = Connection &
  PostConnection & {
    __typename?: "TagToPostConnection";
    /** Edges for the TagToPostConnection connection */
    edges: Array<TagToPostConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Post>;
    /** Information about pagination in a connection. */
    pageInfo: TagToPostConnectionPageInfo;
  };

/** An edge in a connection */
export type TagToPostConnectionEdge = Edge &
  PostConnectionEdge & {
    __typename?: "TagToPostConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Post;
  };

/** Page Info on the &quot;TagToPostConnection&quot; */
export type TagToPostConnectionPageInfo = PageInfo &
  PostConnectionPageInfo &
  WpPageInfo & {
    __typename?: "TagToPostConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the TagToPostConnection connection */
export type TagToPostConnectionWhereArgs = {
  /** The user that's connected as the author of the object. Use the userId for the author object. */
  author?: InputMaybe<Scalars["Int"]["input"]>;
  /** Find objects connected to author(s) in the array of author's userIds */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Find objects connected to the author by the author's nicename */
  authorName?: InputMaybe<Scalars["String"]["input"]>;
  /** Find objects NOT connected to author(s) in the array of author's userIds */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Category ID */
  categoryId?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of category IDs, used to display objects from one category OR another */
  categoryIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Use Category Slug */
  categoryName?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of category IDs, used to display objects from one category OR another */
  categoryNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Tag Slug */
  tag?: InputMaybe<Scalars["String"]["input"]>;
  /** Use Tag ID */
  tagId?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of tag IDs, used to display objects from one tag OR another */
  tagIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of tag IDs, used to display objects from one tag OR another */
  tagNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of tag slugs, used to display objects from one tag AND another */
  tagSlugAnd?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Array of tag slugs, used to include objects in ANY specified tags */
  tagSlugIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the Tag type and the Taxonomy type */
export type TagToTaxonomyConnectionEdge = Edge &
  OneToOneConnection &
  TaxonomyConnectionEdge & {
    __typename?: "TagToTaxonomyConnectionEdge";
    /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The node of the connection, without the edges */
    node: Taxonomy;
  };

/** A taxonomy object */
export type Taxonomy = Node & {
  __typename?: "Taxonomy";
  /** List of Content Types associated with the Taxonomy */
  connectedContentTypes?: Maybe<TaxonomyToContentTypeConnection>;
  /** List of Term Nodes associated with the Taxonomy */
  connectedTerms?: Maybe<TaxonomyToTermNodeConnection>;
  /** Description of the taxonomy. This field is equivalent to WP_Taxonomy-&gt;description */
  description?: Maybe<Scalars["String"]["output"]>;
  /** The plural name of the post type within the GraphQL Schema. */
  graphqlPluralName?: Maybe<Scalars["String"]["output"]>;
  /** The singular name of the post type within the GraphQL Schema. */
  graphqlSingleName?: Maybe<Scalars["String"]["output"]>;
  /** Whether the taxonomy is hierarchical */
  hierarchical?: Maybe<Scalars["Boolean"]["output"]>;
  /** The globally unique identifier of the taxonomy object. */
  id: Scalars["ID"]["output"];
  /** Whether the object is restricted from the current viewer */
  isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
  /** Name of the taxonomy shown in the menu. Usually plural. */
  label?: Maybe<Scalars["String"]["output"]>;
  /** The display name of the taxonomy. This field is equivalent to WP_Taxonomy-&gt;label */
  name?: Maybe<Scalars["String"]["output"]>;
  /** Whether the taxonomy is publicly queryable */
  public?: Maybe<Scalars["Boolean"]["output"]>;
  /** Name of content type to display in REST API &quot;wp/v2&quot; namespace. */
  restBase?: Maybe<Scalars["String"]["output"]>;
  /** The REST Controller class assigned to handling this content type. */
  restControllerClass?: Maybe<Scalars["String"]["output"]>;
  /** Whether to show the taxonomy as part of a tag cloud widget. This field is equivalent to WP_Taxonomy-&gt;show_tagcloud */
  showCloud?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether to display a column for the taxonomy on its post type listing screens. */
  showInAdminColumn?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether to add the post type to the GraphQL Schema. */
  showInGraphql?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether to show the taxonomy in the admin menu */
  showInMenu?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether the taxonomy is available for selection in navigation menus. */
  showInNavMenus?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether to show the taxonomy in the quick/bulk edit panel. */
  showInQuickEdit?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether to add the post type route in the REST API &quot;wp/v2&quot; namespace. */
  showInRest?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether to generate and allow a UI for managing terms in this taxonomy in the admin */
  showUi?: Maybe<Scalars["Boolean"]["output"]>;
};

/** A taxonomy object */
export type TaxonomyConnectedContentTypesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** A taxonomy object */
export type TaxonomyConnectedTermsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** Connection to Taxonomy Nodes */
export type TaxonomyConnection = {
  /** A list of edges (relational context) between RootQuery and connected Taxonomy Nodes */
  edges: Array<TaxonomyConnectionEdge>;
  /** A list of connected Taxonomy Nodes */
  nodes: Array<Taxonomy>;
  /** Information about pagination in a connection. */
  pageInfo: TaxonomyConnectionPageInfo;
};

/** Edge between a Node and a connected Taxonomy */
export type TaxonomyConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected Taxonomy Node */
  node: Taxonomy;
};

/** Page Info on the connected TaxonomyConnectionEdge */
export type TaxonomyConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** Allowed taxonomies */
export enum TaxonomyEnum {
  /** Taxonomy enum category */
  Category = "CATEGORY",
  /** Taxonomy enum post_format */
  Postformat = "POSTFORMAT",
  /** Taxonomy enum post_tag */
  Tag = "TAG",
}

/** The Type of Identifier used to fetch a single Taxonomy node. To be used along with the "id" field. Default is "ID". */
export enum TaxonomyIdTypeEnum {
  /** The globally unique ID */
  Id = "ID",
  /** The name of the taxonomy */
  Name = "NAME",
}

export type TaxonomySeo = {
  __typename?: "TaxonomySEO";
  breadcrumbs?: Maybe<Array<Maybe<SeoPostTypeBreadcrumbs>>>;
  canonical?: Maybe<Scalars["String"]["output"]>;
  cornerstone?: Maybe<Scalars["Boolean"]["output"]>;
  focuskw?: Maybe<Scalars["String"]["output"]>;
  fullHead?: Maybe<Scalars["String"]["output"]>;
  metaDesc?: Maybe<Scalars["String"]["output"]>;
  metaKeywords?: Maybe<Scalars["String"]["output"]>;
  metaRobotsNofollow?: Maybe<Scalars["String"]["output"]>;
  metaRobotsNoindex?: Maybe<Scalars["String"]["output"]>;
  opengraphAuthor?: Maybe<Scalars["String"]["output"]>;
  opengraphDescription?: Maybe<Scalars["String"]["output"]>;
  opengraphImage?: Maybe<MediaItem>;
  opengraphModifiedTime?: Maybe<Scalars["String"]["output"]>;
  opengraphPublishedTime?: Maybe<Scalars["String"]["output"]>;
  opengraphPublisher?: Maybe<Scalars["String"]["output"]>;
  opengraphSiteName?: Maybe<Scalars["String"]["output"]>;
  opengraphTitle?: Maybe<Scalars["String"]["output"]>;
  opengraphType?: Maybe<Scalars["String"]["output"]>;
  opengraphUrl?: Maybe<Scalars["String"]["output"]>;
  schema?: Maybe<SeoTaxonomySchema>;
  title?: Maybe<Scalars["String"]["output"]>;
  twitterDescription?: Maybe<Scalars["String"]["output"]>;
  twitterImage?: Maybe<MediaItem>;
  twitterTitle?: Maybe<Scalars["String"]["output"]>;
};

/** Connection between the Taxonomy type and the ContentType type */
export type TaxonomyToContentTypeConnection = Connection &
  ContentTypeConnection & {
    __typename?: "TaxonomyToContentTypeConnection";
    /** Edges for the TaxonomyToContentTypeConnection connection */
    edges: Array<TaxonomyToContentTypeConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<ContentType>;
    /** Information about pagination in a connection. */
    pageInfo: TaxonomyToContentTypeConnectionPageInfo;
  };

/** An edge in a connection */
export type TaxonomyToContentTypeConnectionEdge = ContentTypeConnectionEdge &
  Edge & {
    __typename?: "TaxonomyToContentTypeConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: ContentType;
  };

/** Page Info on the &quot;TaxonomyToContentTypeConnection&quot; */
export type TaxonomyToContentTypeConnectionPageInfo =
  ContentTypeConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "TaxonomyToContentTypeConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Connection between the Taxonomy type and the TermNode type */
export type TaxonomyToTermNodeConnection = Connection &
  TermNodeConnection & {
    __typename?: "TaxonomyToTermNodeConnection";
    /** Edges for the TaxonomyToTermNodeConnection connection */
    edges: Array<TaxonomyToTermNodeConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<TermNode>;
    /** Information about pagination in a connection. */
    pageInfo: TaxonomyToTermNodeConnectionPageInfo;
  };

/** An edge in a connection */
export type TaxonomyToTermNodeConnectionEdge = Edge &
  TermNodeConnectionEdge & {
    __typename?: "TaxonomyToTermNodeConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: TermNode;
  };

/** Page Info on the &quot;TaxonomyToTermNodeConnection&quot; */
export type TaxonomyToTermNodeConnectionPageInfo = PageInfo &
  TermNodeConnectionPageInfo &
  WpPageInfo & {
    __typename?: "TaxonomyToTermNodeConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Terms are nodes within a Taxonomy, used to group and relate other nodes. */
export type TermNode = {
  /** The number of objects connected to the object */
  count?: Maybe<Scalars["Int"]["output"]>;
  /** Identifies the primary key from the database. */
  databaseId: Scalars["Int"]["output"];
  /** The description of the object */
  description?: Maybe<Scalars["String"]["output"]>;
  /** Connection between the TermNode type and the EnqueuedScript type */
  enqueuedScripts?: Maybe<TermNodeToEnqueuedScriptConnection>;
  /** Connection between the TermNode type and the EnqueuedStylesheet type */
  enqueuedStylesheets?: Maybe<TermNodeToEnqueuedStylesheetConnection>;
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
  /** Whether the node is a Content Node */
  isContentNode: Scalars["Boolean"]["output"];
  /** Whether the object is restricted from the current viewer */
  isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
  /** Whether the node is a Term */
  isTermNode: Scalars["Boolean"]["output"];
  /** The link to the term */
  link?: Maybe<Scalars["String"]["output"]>;
  /** The human friendly name of the object. */
  name?: Maybe<Scalars["String"]["output"]>;
  /** An alphanumeric identifier for the object unique to its type. */
  slug?: Maybe<Scalars["String"]["output"]>;
  /** The name of the taxonomy that the object is associated with */
  taxonomyName?: Maybe<Scalars["String"]["output"]>;
  /** The ID of the term group that this term object belongs to */
  termGroupId?: Maybe<Scalars["Int"]["output"]>;
  /** The taxonomy ID that the object is associated with */
  termTaxonomyId?: Maybe<Scalars["Int"]["output"]>;
  /** The unique resource identifier path */
  uri?: Maybe<Scalars["String"]["output"]>;
};

/** Terms are nodes within a Taxonomy, used to group and relate other nodes. */
export type TermNodeEnqueuedScriptsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** Terms are nodes within a Taxonomy, used to group and relate other nodes. */
export type TermNodeEnqueuedStylesheetsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** Connection to TermNode Nodes */
export type TermNodeConnection = {
  /** A list of edges (relational context) between RootQuery and connected TermNode Nodes */
  edges: Array<TermNodeConnectionEdge>;
  /** A list of connected TermNode Nodes */
  nodes: Array<TermNode>;
  /** Information about pagination in a connection. */
  pageInfo: TermNodeConnectionPageInfo;
};

/** Edge between a Node and a connected TermNode */
export type TermNodeConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected TermNode Node */
  node: TermNode;
};

/** Page Info on the connected TermNodeConnectionEdge */
export type TermNodeConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** The Type of Identifier used to fetch a single resource. Default is "ID". To be used along with the "id" field. */
export enum TermNodeIdTypeEnum {
  /** The Database ID for the node */
  DatabaseId = "DATABASE_ID",
  /** The hashed Global ID */
  Id = "ID",
  /** The name of the node */
  Name = "NAME",
  /** Url friendly name of the node */
  Slug = "SLUG",
  /** The URI for the node */
  Uri = "URI",
}

/** Connection between the TermNode type and the EnqueuedScript type */
export type TermNodeToEnqueuedScriptConnection = Connection &
  EnqueuedScriptConnection & {
    __typename?: "TermNodeToEnqueuedScriptConnection";
    /** Edges for the TermNodeToEnqueuedScriptConnection connection */
    edges: Array<TermNodeToEnqueuedScriptConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<EnqueuedScript>;
    /** Information about pagination in a connection. */
    pageInfo: TermNodeToEnqueuedScriptConnectionPageInfo;
  };

/** An edge in a connection */
export type TermNodeToEnqueuedScriptConnectionEdge = Edge &
  EnqueuedScriptConnectionEdge & {
    __typename?: "TermNodeToEnqueuedScriptConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: EnqueuedScript;
  };

/** Page Info on the &quot;TermNodeToEnqueuedScriptConnection&quot; */
export type TermNodeToEnqueuedScriptConnectionPageInfo =
  EnqueuedScriptConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "TermNodeToEnqueuedScriptConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Connection between the TermNode type and the EnqueuedStylesheet type */
export type TermNodeToEnqueuedStylesheetConnection = Connection &
  EnqueuedStylesheetConnection & {
    __typename?: "TermNodeToEnqueuedStylesheetConnection";
    /** Edges for the TermNodeToEnqueuedStylesheetConnection connection */
    edges: Array<TermNodeToEnqueuedStylesheetConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<EnqueuedStylesheet>;
    /** Information about pagination in a connection. */
    pageInfo: TermNodeToEnqueuedStylesheetConnectionPageInfo;
  };

/** An edge in a connection */
export type TermNodeToEnqueuedStylesheetConnectionEdge = Edge &
  EnqueuedStylesheetConnectionEdge & {
    __typename?: "TermNodeToEnqueuedStylesheetConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: EnqueuedStylesheet;
  };

/** Page Info on the &quot;TermNodeToEnqueuedStylesheetConnection&quot; */
export type TermNodeToEnqueuedStylesheetConnectionPageInfo =
  EnqueuedStylesheetConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "TermNodeToEnqueuedStylesheetConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Options for ordering the connection by */
export enum TermObjectsConnectionOrderbyEnum {
  /** Order the connection by item count. */
  Count = "COUNT",
  /** Order the connection by description. */
  Description = "DESCRIPTION",
  /** Order the connection by name. */
  Name = "NAME",
  /** Order the connection by slug. */
  Slug = "SLUG",
  /** Order the connection by term group. */
  TermGroup = "TERM_GROUP",
  /** Order the connection by term id. */
  TermId = "TERM_ID",
  /** Order the connection by term order. */
  TermOrder = "TERM_ORDER",
}

/** A theme object */
export type Theme = Node & {
  __typename?: "Theme";
  /** Name of the theme author(s), could also be a company name. This field is equivalent to WP_Theme-&gt;get( &quot;Author&quot; ). */
  author?: Maybe<Scalars["String"]["output"]>;
  /** URI for the author/company website. This field is equivalent to WP_Theme-&gt;get( &quot;AuthorURI&quot; ). */
  authorUri?: Maybe<Scalars["String"]["output"]>;
  /** The description of the theme. This field is equivalent to WP_Theme-&gt;get( &quot;Description&quot; ). */
  description?: Maybe<Scalars["String"]["output"]>;
  /** The globally unique identifier of the theme object. */
  id: Scalars["ID"]["output"];
  /** Whether the object is restricted from the current viewer */
  isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
  /** Display name of the theme. This field is equivalent to WP_Theme-&gt;get( &quot;Name&quot; ). */
  name?: Maybe<Scalars["String"]["output"]>;
  /** The URL of the screenshot for the theme. The screenshot is intended to give an overview of what the theme looks like. This field is equivalent to WP_Theme-&gt;get_screenshot(). */
  screenshot?: Maybe<Scalars["String"]["output"]>;
  /** The theme slug is used to internally match themes. Theme slugs can have subdirectories like: my-theme/sub-theme. This field is equivalent to WP_Theme-&gt;get_stylesheet(). */
  slug?: Maybe<Scalars["String"]["output"]>;
  /** URI for the author/company website. This field is equivalent to WP_Theme-&gt;get( &quot;Tags&quot; ). */
  tags?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
  /** A URI if the theme has a website associated with it. The Theme URI is handy for directing users to a theme site for support etc. This field is equivalent to WP_Theme-&gt;get( &quot;ThemeURI&quot; ). */
  themeUri?: Maybe<Scalars["String"]["output"]>;
  /** The current version of the theme. This field is equivalent to WP_Theme-&gt;get( &quot;Version&quot; ). */
  version?: Maybe<Scalars["String"]["output"]>;
};

/** Connection to Theme Nodes */
export type ThemeConnection = {
  /** A list of edges (relational context) between RootQuery and connected Theme Nodes */
  edges: Array<ThemeConnectionEdge>;
  /** A list of connected Theme Nodes */
  nodes: Array<Theme>;
  /** Information about pagination in a connection. */
  pageInfo: ThemeConnectionPageInfo;
};

/** Edge between a Node and a connected Theme */
export type ThemeConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected Theme Node */
  node: Theme;
};

/** Page Info on the connected ThemeConnectionEdge */
export type ThemeConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** Any node that has a URI */
export type UniformResourceIdentifiable = {
  /** The globally unique ID for the object */
  id: Scalars["ID"]["output"];
  /** Whether the node is a Content Node */
  isContentNode: Scalars["Boolean"]["output"];
  /** Whether the node is a Term */
  isTermNode: Scalars["Boolean"]["output"];
  /** The unique resource identifier path */
  uri?: Maybe<Scalars["String"]["output"]>;
};

/** Input for the updateCategory mutation. */
export type UpdateCategoryInput = {
  /** The slug that the category will be an alias of */
  aliasOf?: InputMaybe<Scalars["String"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The description of the category object */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the category object to update */
  id: Scalars["ID"]["input"];
  /** The name of the category object to mutate */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the category that should be set as the parent */
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  /** If this argument exists then the slug will be checked to see if it is not an existing valid term. If that check succeeds (it is not a valid term), then it is added and the term id is given. If it fails, then a check is made to whether the taxonomy is hierarchical and the parent argument is not empty. If the second check succeeds, the term will be inserted and the term id will be given. If the slug argument is empty, then it will be calculated from the term name. */
  slug?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the updateCategory mutation. */
export type UpdateCategoryPayload = {
  __typename?: "UpdateCategoryPayload";
  /** The created category */
  category?: Maybe<Category>;
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
};

/** Input for the updateComment mutation. */
export type UpdateCommentInput = {
  /** The approval status of the comment. */
  approved?: InputMaybe<Scalars["String"]["input"]>;
  /** The name of the comment's author. */
  author?: InputMaybe<Scalars["String"]["input"]>;
  /** The email of the comment's author. */
  authorEmail?: InputMaybe<Scalars["String"]["input"]>;
  /** The url of the comment's author. */
  authorUrl?: InputMaybe<Scalars["String"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The database ID of the post object the comment belongs to. */
  commentOn?: InputMaybe<Scalars["Int"]["input"]>;
  /** Content of the comment. */
  content?: InputMaybe<Scalars["String"]["input"]>;
  /** The date of the object. Preferable to enter as year/month/day ( e.g. 01/31/2017 ) as it will rearrange date as fit if it is not specified. Incomplete dates may have unintended results for example, "2017" as the input will use current date with timestamp 20:17  */
  date?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the comment being updated. */
  id: Scalars["ID"]["input"];
  /** Parent comment ID of current comment. */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** The approval status of the comment */
  status?: InputMaybe<CommentStatusEnum>;
  /** Type of comment. */
  type?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the updateComment mutation. */
export type UpdateCommentPayload = {
  __typename?: "UpdateCommentPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The comment that was created */
  comment?: Maybe<Comment>;
  /** Whether the mutation succeeded. If the comment is not approved, the server will not return the comment to a non authenticated user, but a success message can be returned if the create succeeded, and the client can optimistically add the comment to the client cache */
  success?: Maybe<Scalars["Boolean"]["output"]>;
};

/** Input for the updateMediaItem mutation. */
export type UpdateMediaItemInput = {
  /** Alternative text to display when mediaItem is not displayed */
  altText?: InputMaybe<Scalars["String"]["input"]>;
  /** The userId to assign as the author of the mediaItem */
  authorId?: InputMaybe<Scalars["ID"]["input"]>;
  /** The caption for the mediaItem */
  caption?: InputMaybe<Scalars["String"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The comment status for the mediaItem */
  commentStatus?: InputMaybe<Scalars["String"]["input"]>;
  /** The date of the mediaItem */
  date?: InputMaybe<Scalars["String"]["input"]>;
  /** The date (in GMT zone) of the mediaItem */
  dateGmt?: InputMaybe<Scalars["String"]["input"]>;
  /** Description of the mediaItem */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** The file name of the mediaItem */
  filePath?: InputMaybe<Scalars["String"]["input"]>;
  /** The file type of the mediaItem */
  fileType?: InputMaybe<MimeTypeEnum>;
  /** The ID of the mediaItem object */
  id: Scalars["ID"]["input"];
  /** The ID of the parent object */
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  /** The ping status for the mediaItem */
  pingStatus?: InputMaybe<Scalars["String"]["input"]>;
  /** The slug of the mediaItem */
  slug?: InputMaybe<Scalars["String"]["input"]>;
  /** The status of the mediaItem */
  status?: InputMaybe<MediaItemStatusEnum>;
  /** The title of the mediaItem */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the updateMediaItem mutation. */
export type UpdateMediaItemPayload = {
  __typename?: "UpdateMediaItemPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The MediaItem object mutation type. */
  mediaItem?: Maybe<MediaItem>;
};

/** Input for the updatePage mutation. */
export type UpdatePageInput = {
  /** The userId to assign as the author of the object */
  authorId?: InputMaybe<Scalars["ID"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The comment status for the object */
  commentStatus?: InputMaybe<Scalars["String"]["input"]>;
  /** The content of the object */
  content?: InputMaybe<Scalars["String"]["input"]>;
  /** The date of the object. Preferable to enter as year/month/day (e.g. 01/31/2017) as it will rearrange date as fit if it is not specified. Incomplete dates may have unintended results for example, "2017" as the input will use current date with timestamp 20:17  */
  date?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the page object */
  id: Scalars["ID"]["input"];
  /** Override the edit lock when another user is editing the post */
  ignoreEditLock?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** A field used for ordering posts. This is typically used with nav menu items or for special ordering of hierarchical content types. */
  menuOrder?: InputMaybe<Scalars["Int"]["input"]>;
  /** The ID of the parent object */
  parentId?: InputMaybe<Scalars["ID"]["input"]>;
  /** The password used to protect the content of the object */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** The slug of the object */
  slug?: InputMaybe<Scalars["String"]["input"]>;
  /** The status of the object */
  status?: InputMaybe<PostStatusEnum>;
  /** The title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the updatePage mutation. */
export type UpdatePagePayload = {
  __typename?: "UpdatePagePayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The Post object mutation type. */
  page?: Maybe<Page>;
};

/** Input for the updatePostFormat mutation. */
export type UpdatePostFormatInput = {
  /** The slug that the post_format will be an alias of */
  aliasOf?: InputMaybe<Scalars["String"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The description of the post_format object */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the postFormat object to update */
  id: Scalars["ID"]["input"];
  /** The name of the post_format object to mutate */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** If this argument exists then the slug will be checked to see if it is not an existing valid term. If that check succeeds (it is not a valid term), then it is added and the term id is given. If it fails, then a check is made to whether the taxonomy is hierarchical and the parent argument is not empty. If the second check succeeds, the term will be inserted and the term id will be given. If the slug argument is empty, then it will be calculated from the term name. */
  slug?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the updatePostFormat mutation. */
export type UpdatePostFormatPayload = {
  __typename?: "UpdatePostFormatPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The created post_format */
  postFormat?: Maybe<PostFormat>;
};

/** Input for the updatePost mutation. */
export type UpdatePostInput = {
  /** The userId to assign as the author of the object */
  authorId?: InputMaybe<Scalars["ID"]["input"]>;
  /** Set connections between the post and categories */
  categories?: InputMaybe<PostCategoriesInput>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The comment status for the object */
  commentStatus?: InputMaybe<Scalars["String"]["input"]>;
  /** The content of the object */
  content?: InputMaybe<Scalars["String"]["input"]>;
  /** The date of the object. Preferable to enter as year/month/day (e.g. 01/31/2017) as it will rearrange date as fit if it is not specified. Incomplete dates may have unintended results for example, "2017" as the input will use current date with timestamp 20:17  */
  date?: InputMaybe<Scalars["String"]["input"]>;
  /** The excerpt of the object */
  excerpt?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the post object */
  id: Scalars["ID"]["input"];
  /** Override the edit lock when another user is editing the post */
  ignoreEditLock?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** A field used for ordering posts. This is typically used with nav menu items or for special ordering of hierarchical content types. */
  menuOrder?: InputMaybe<Scalars["Int"]["input"]>;
  /** The password used to protect the content of the object */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** The ping status for the object */
  pingStatus?: InputMaybe<Scalars["String"]["input"]>;
  /** URLs that have been pinged. */
  pinged?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Set connections between the post and postFormats */
  postFormats?: InputMaybe<PostPostFormatsInput>;
  /** The slug of the object */
  slug?: InputMaybe<Scalars["String"]["input"]>;
  /** The status of the object */
  status?: InputMaybe<PostStatusEnum>;
  /** Set connections between the post and tags */
  tags?: InputMaybe<PostTagsInput>;
  /** The title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
  /** URLs queued to be pinged. */
  toPing?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
};

/** The payload for the updatePost mutation. */
export type UpdatePostPayload = {
  __typename?: "UpdatePostPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The Post object mutation type. */
  post?: Maybe<Post>;
};

/** Input for the updateSettings mutation. */
export type UpdateSettingsInput = {
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** Allow people to submit comments on new posts. */
  discussionSettingsDefaultCommentStatus?: InputMaybe<
    Scalars["String"]["input"]
  >;
  /** Allow link notifications from other blogs (pingbacks and trackbacks) on new articles. */
  discussionSettingsDefaultPingStatus?: InputMaybe<Scalars["String"]["input"]>;
  /** A date format for all date strings. */
  generalSettingsDateFormat?: InputMaybe<Scalars["String"]["input"]>;
  /** Site tagline. */
  generalSettingsDescription?: InputMaybe<Scalars["String"]["input"]>;
  /** This address is used for admin purposes, like new user notification. */
  generalSettingsEmail?: InputMaybe<Scalars["String"]["input"]>;
  /** WordPress locale code. */
  generalSettingsLanguage?: InputMaybe<Scalars["String"]["input"]>;
  /** A day number of the week that the week should start on. */
  generalSettingsStartOfWeek?: InputMaybe<Scalars["Int"]["input"]>;
  /** A time format for all time strings. */
  generalSettingsTimeFormat?: InputMaybe<Scalars["String"]["input"]>;
  /** A city in the same timezone as you. */
  generalSettingsTimezone?: InputMaybe<Scalars["String"]["input"]>;
  /** Site title. */
  generalSettingsTitle?: InputMaybe<Scalars["String"]["input"]>;
  /** Site URL. */
  generalSettingsUrl?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the page that should display the latest posts */
  readingSettingsPageForPosts?: InputMaybe<Scalars["Int"]["input"]>;
  /** The ID of the page that should be displayed on the front page */
  readingSettingsPageOnFront?: InputMaybe<Scalars["Int"]["input"]>;
  /** Blog pages show at most. */
  readingSettingsPostsPerPage?: InputMaybe<Scalars["Int"]["input"]>;
  /** What to show on the front page */
  readingSettingsShowOnFront?: InputMaybe<Scalars["String"]["input"]>;
  /** Default post category. */
  writingSettingsDefaultCategory?: InputMaybe<Scalars["Int"]["input"]>;
  /** Default post format. */
  writingSettingsDefaultPostFormat?: InputMaybe<Scalars["String"]["input"]>;
  /** Convert emoticons like :-) and :-P to graphics on display. */
  writingSettingsUseSmilies?: InputMaybe<Scalars["Boolean"]["input"]>;
};

/** The payload for the updateSettings mutation. */
export type UpdateSettingsPayload = {
  __typename?: "UpdateSettingsPayload";
  /** Update all settings. */
  allSettings?: Maybe<Settings>;
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** Update the DiscussionSettings setting. */
  discussionSettings?: Maybe<DiscussionSettings>;
  /** Update the GeneralSettings setting. */
  generalSettings?: Maybe<GeneralSettings>;
  /** Update the ReadingSettings setting. */
  readingSettings?: Maybe<ReadingSettings>;
  /** Update the WritingSettings setting. */
  writingSettings?: Maybe<WritingSettings>;
};

/** Input for the updateTag mutation. */
export type UpdateTagInput = {
  /** The slug that the post_tag will be an alias of */
  aliasOf?: InputMaybe<Scalars["String"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** The description of the post_tag object */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the tag object to update */
  id: Scalars["ID"]["input"];
  /** The name of the post_tag object to mutate */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** If this argument exists then the slug will be checked to see if it is not an existing valid term. If that check succeeds (it is not a valid term), then it is added and the term id is given. If it fails, then a check is made to whether the taxonomy is hierarchical and the parent argument is not empty. If the second check succeeds, the term will be inserted and the term id will be given. If the slug argument is empty, then it will be calculated from the term name. */
  slug?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the updateTag mutation. */
export type UpdateTagPayload = {
  __typename?: "UpdateTagPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The created post_tag */
  tag?: Maybe<Tag>;
};

/** Input for the updateUser mutation. */
export type UpdateUserInput = {
  /** User's AOL IM account. */
  aim?: InputMaybe<Scalars["String"]["input"]>;
  /** This is an ID that can be passed to a mutation by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: InputMaybe<Scalars["String"]["input"]>;
  /** A string containing content about the user. */
  description?: InputMaybe<Scalars["String"]["input"]>;
  /** A string that will be shown on the site. Defaults to user's username. It is likely that you will want to change this, for both appearance and security through obscurity (that is if you dont use and delete the default admin user). */
  displayName?: InputMaybe<Scalars["String"]["input"]>;
  /** A string containing the user's email address. */
  email?: InputMaybe<Scalars["String"]["input"]>;
  /** 	The user's first name. */
  firstName?: InputMaybe<Scalars["String"]["input"]>;
  /** The ID of the user */
  id: Scalars["ID"]["input"];
  /** User's Jabber account. */
  jabber?: InputMaybe<Scalars["String"]["input"]>;
  /** The user's last name. */
  lastName?: InputMaybe<Scalars["String"]["input"]>;
  /** User's locale. */
  locale?: InputMaybe<Scalars["String"]["input"]>;
  /** A string that contains a URL-friendly name for the user. The default is the user's username. */
  nicename?: InputMaybe<Scalars["String"]["input"]>;
  /** The user's nickname, defaults to the user's username. */
  nickname?: InputMaybe<Scalars["String"]["input"]>;
  /** A string that contains the plain text password for the user. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** If true, this will refresh the users JWT secret. */
  refreshJwtUserSecret?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** The date the user registered. Format is Y-m-d H:i:s. */
  registered?: InputMaybe<Scalars["String"]["input"]>;
  /** If true, this will revoke the users JWT secret. If false, this will unrevoke the JWT secret AND issue a new one. To revoke, the user must have proper capabilities to edit users JWT secrets. */
  revokeJwtUserSecret?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** A string for whether to enable the rich editor or not. False if not empty. */
  richEditing?: InputMaybe<Scalars["String"]["input"]>;
  /** An array of roles to be assigned to the user. */
  roles?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** A string containing the user's URL for the user's web site. */
  websiteUrl?: InputMaybe<Scalars["String"]["input"]>;
  /** User's Yahoo IM account. */
  yim?: InputMaybe<Scalars["String"]["input"]>;
};

/** The payload for the updateUser mutation. */
export type UpdateUserPayload = {
  __typename?: "UpdateUserPayload";
  /** If a &#039;clientMutationId&#039; input is provided to the mutation, it will be returned as output on the mutation. This ID can be used by the client to track the progress of mutations and catch possible duplicate mutation submissions. */
  clientMutationId?: Maybe<Scalars["String"]["output"]>;
  /** The User object mutation type. */
  user?: Maybe<User>;
};

/** A User object */
export type User = Commenter &
  DatabaseIdentifier &
  Node &
  UniformResourceIdentifiable & {
    __typename?: "User";
    /** Avatar object for user. The avatar object can be retrieved in different sizes by specifying the size argument. */
    avatar?: Maybe<Avatar>;
    /** User metadata option name. Usually it will be &quot;wp_capabilities&quot;. */
    capKey?: Maybe<Scalars["String"]["output"]>;
    /** A list of capabilities (permissions) granted to the user */
    capabilities?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
    /** Connection between the User type and the Comment type */
    comments?: Maybe<UserToCommentConnection>;
    /** Identifies the primary key from the database. */
    databaseId: Scalars["Int"]["output"];
    /** Description of the user. */
    description?: Maybe<Scalars["String"]["output"]>;
    /** Email address of the user. This is equivalent to the WP_User-&gt;user_email property. */
    email?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the User type and the EnqueuedScript type */
    enqueuedScripts?: Maybe<UserToEnqueuedScriptConnection>;
    /** Connection between the User type and the EnqueuedStylesheet type */
    enqueuedStylesheets?: Maybe<UserToEnqueuedStylesheetConnection>;
    /** A complete list of capabilities including capabilities inherited from a role. This is equivalent to the array keys of WP_User-&gt;allcaps. */
    extraCapabilities?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
    /** First name of the user. This is equivalent to the WP_User-&gt;user_first_name property. */
    firstName?: Maybe<Scalars["String"]["output"]>;
    /** The globally unique identifier for the user object. */
    id: Scalars["ID"]["output"];
    /** Whether the node is a Content Node */
    isContentNode: Scalars["Boolean"]["output"];
    /** Whether the JWT User secret has been revoked. If the secret has been revoked, auth tokens will not be issued until an admin, or user with proper capabilities re-issues a secret for the user. */
    isJwtAuthSecretRevoked: Scalars["Boolean"]["output"];
    /** Whether the object is restricted from the current viewer */
    isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
    /** Whether the node is a Term */
    isTermNode: Scalars["Boolean"]["output"];
    /** The expiration for the JWT Token for the user. If not set custom for the user, it will use the default sitewide expiration setting */
    jwtAuthExpiration?: Maybe<Scalars["String"]["output"]>;
    /** A JWT token that can be used in future requests for authentication/authorization */
    jwtAuthToken?: Maybe<Scalars["String"]["output"]>;
    /** A JWT token that can be used in future requests to get a refreshed jwtAuthToken. If the refresh token used in a request is revoked or otherwise invalid, a valid Auth token will NOT be issued in the response headers. */
    jwtRefreshToken?: Maybe<Scalars["String"]["output"]>;
    /** A unique secret tied to the users JWT token that can be revoked or refreshed. Revoking the secret prevents JWT tokens from being issued to the user. Refreshing the token invalidates previously issued tokens, but allows new tokens to be issued. */
    jwtUserSecret?: Maybe<Scalars["String"]["output"]>;
    /** Last name of the user. This is equivalent to the WP_User-&gt;user_last_name property. */
    lastName?: Maybe<Scalars["String"]["output"]>;
    /** The preferred language locale set for the user. Value derived from get_user_locale(). */
    locale?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the User type and the mediaItem type */
    mediaItems?: Maybe<UserToMediaItemConnection>;
    /** Display name of the user. This is equivalent to the WP_User-&gt;display_name property. */
    name?: Maybe<Scalars["String"]["output"]>;
    /** The nicename for the user. This field is equivalent to WP_User-&gt;user_nicename */
    nicename?: Maybe<Scalars["String"]["output"]>;
    /** Nickname of the user. */
    nickname?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the User type and the page type */
    pages?: Maybe<UserToPageConnection>;
    /** Connection between the User type and the post type */
    posts?: Maybe<UserToPostConnection>;
    /** The date the user registered or was created. The field follows a full ISO8601 date string format. */
    registeredDate?: Maybe<Scalars["String"]["output"]>;
    /** Connection between the User and Revisions authored by the user */
    revisions?: Maybe<UserToRevisionsConnection>;
    /** Connection between the User type and the UserRole type */
    roles?: Maybe<UserToUserRoleConnection>;
    /** The Yoast SEO data of a user */
    seo?: Maybe<SeoUser>;
    /** Whether the Toolbar should be displayed when the user is viewing the site. */
    shouldShowAdminToolbar?: Maybe<Scalars["Boolean"]["output"]>;
    /** The slug for the user. This field is equivalent to WP_User-&gt;user_nicename */
    slug?: Maybe<Scalars["String"]["output"]>;
    /** The unique resource identifier path */
    uri?: Maybe<Scalars["String"]["output"]>;
    /** A website url that is associated with the user. */
    url?: Maybe<Scalars["String"]["output"]>;
    /**
     * The Id of the user. Equivalent to WP_User-&gt;ID
     * @deprecated Deprecated in favor of the databaseId field
     */
    userId?: Maybe<Scalars["Int"]["output"]>;
    /** Username for the user. This field is equivalent to WP_User-&gt;user_login. */
    username?: Maybe<Scalars["String"]["output"]>;
  };

/** A User object */
export type UserAvatarArgs = {
  forceDefault?: InputMaybe<Scalars["Boolean"]["input"]>;
  rating?: InputMaybe<AvatarRatingEnum>;
  size?: InputMaybe<Scalars["Int"]["input"]>;
};

/** A User object */
export type UserCommentsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<UserToCommentConnectionWhereArgs>;
};

/** A User object */
export type UserEnqueuedScriptsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** A User object */
export type UserEnqueuedStylesheetsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** A User object */
export type UserMediaItemsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<UserToMediaItemConnectionWhereArgs>;
};

/** A User object */
export type UserPagesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<UserToPageConnectionWhereArgs>;
};

/** A User object */
export type UserPostsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<UserToPostConnectionWhereArgs>;
};

/** A User object */
export type UserRevisionsArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
  where?: InputMaybe<UserToRevisionsConnectionWhereArgs>;
};

/** A User object */
export type UserRolesArgs = {
  after?: InputMaybe<Scalars["String"]["input"]>;
  before?: InputMaybe<Scalars["String"]["input"]>;
  first?: InputMaybe<Scalars["Int"]["input"]>;
  last?: InputMaybe<Scalars["Int"]["input"]>;
};

/** Connection to User Nodes */
export type UserConnection = {
  /** A list of edges (relational context) between RootQuery and connected User Nodes */
  edges: Array<UserConnectionEdge>;
  /** A list of connected User Nodes */
  nodes: Array<User>;
  /** Information about pagination in a connection. */
  pageInfo: UserConnectionPageInfo;
};

/** Edge between a Node and a connected User */
export type UserConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected User Node */
  node: User;
};

/** Page Info on the connected UserConnectionEdge */
export type UserConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** The Type of Identifier used to fetch a single User node. To be used along with the "id" field. Default is "ID". */
export enum UserNodeIdTypeEnum {
  /** The Database ID for the node */
  DatabaseId = "DATABASE_ID",
  /** The Email of the User */
  Email = "EMAIL",
  /** The hashed Global ID */
  Id = "ID",
  /** The slug of the User */
  Slug = "SLUG",
  /** The URI for the node */
  Uri = "URI",
  /** The username the User uses to login with */
  Username = "USERNAME",
}

/** A user role object */
export type UserRole = Node & {
  __typename?: "UserRole";
  /** The capabilities that belong to this role */
  capabilities?: Maybe<Array<Maybe<Scalars["String"]["output"]>>>;
  /** The display name of the role */
  displayName?: Maybe<Scalars["String"]["output"]>;
  /** The globally unique identifier for the user role object. */
  id: Scalars["ID"]["output"];
  /** Whether the object is restricted from the current viewer */
  isRestricted?: Maybe<Scalars["Boolean"]["output"]>;
  /** The registered name of the role */
  name?: Maybe<Scalars["String"]["output"]>;
};

/** Connection to UserRole Nodes */
export type UserRoleConnection = {
  /** A list of edges (relational context) between RootQuery and connected UserRole Nodes */
  edges: Array<UserRoleConnectionEdge>;
  /** A list of connected UserRole Nodes */
  nodes: Array<UserRole>;
  /** Information about pagination in a connection. */
  pageInfo: UserRoleConnectionPageInfo;
};

/** Edge between a Node and a connected UserRole */
export type UserRoleConnectionEdge = {
  /** Opaque reference to the nodes position in the connection. Value can be used with pagination args. */
  cursor?: Maybe<Scalars["String"]["output"]>;
  /** The connected UserRole Node */
  node: UserRole;
};

/** Page Info on the connected UserRoleConnectionEdge */
export type UserRoleConnectionPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** Names of available user roles */
export enum UserRoleEnum {
  /** User role with specific capabilities */
  Administrator = "ADMINISTRATOR",
  /** User role with specific capabilities */
  Author = "AUTHOR",
  /** User role with specific capabilities */
  Contributor = "CONTRIBUTOR",
  /** User role with specific capabilities */
  Editor = "EDITOR",
  /** User role with specific capabilities */
  SeoEditor = "SEO_EDITOR",
  /** User role with specific capabilities */
  SeoManager = "SEO_MANAGER",
  /** User role with specific capabilities */
  Subscriber = "SUBSCRIBER",
}

/** Connection between the User type and the Comment type */
export type UserToCommentConnection = CommentConnection &
  Connection & {
    __typename?: "UserToCommentConnection";
    /** Edges for the UserToCommentConnection connection */
    edges: Array<UserToCommentConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Comment>;
    /** Information about pagination in a connection. */
    pageInfo: UserToCommentConnectionPageInfo;
  };

/** An edge in a connection */
export type UserToCommentConnectionEdge = CommentConnectionEdge &
  Edge & {
    __typename?: "UserToCommentConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Comment;
  };

/** Page Info on the &quot;UserToCommentConnection&quot; */
export type UserToCommentConnectionPageInfo = CommentConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "UserToCommentConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the UserToCommentConnection connection */
export type UserToCommentConnectionWhereArgs = {
  /** Comment author email address. */
  authorEmail?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of author IDs to include comments for. */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to exclude comments for. */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Comment author URL. */
  authorUrl?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of comment IDs to include. */
  commentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of IDs of users whose unapproved comments will be returned by the query regardless of status. */
  commentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Include comments of a given type. */
  commentType?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments from a given array of comment types. */
  commentTypeIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Exclude comments from a given array of comment types. */
  commentTypeNotIn?: InputMaybe<Scalars["String"]["input"]>;
  /** Content object author ID to limit results by. */
  contentAuthor?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs to retrieve comments for. */
  contentAuthorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of author IDs *not* to retrieve comments for. */
  contentAuthorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Limit results to those affiliated with a given content object ID. */
  contentId?: InputMaybe<Scalars["ID"]["input"]>;
  /** Array of content object IDs to include affiliated comments for. */
  contentIdIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of content object IDs to exclude affiliated comments for. */
  contentIdNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Content object name (i.e. slug ) to retrieve affiliated comments for. */
  contentName?: InputMaybe<Scalars["String"]["input"]>;
  /** Content Object parent ID to retrieve affiliated comments for. */
  contentParent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of content object statuses to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentStatus?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Content object type or array of types to retrieve affiliated comments for. Pass 'any' to match any value. */
  contentType?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Array of IDs or email addresses of users whose unapproved comments will be returned by the query regardless of $status. Default empty */
  includeUnapproved?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Karma score to retrieve matching comments for. */
  karma?: InputMaybe<Scalars["Int"]["input"]>;
  /** The cardinality of the order of the connection */
  order?: InputMaybe<OrderEnum>;
  /** Field to order the comments by. */
  orderby?: InputMaybe<CommentsConnectionOrderbyEnum>;
  /** Parent ID of comment to retrieve children of. */
  parent?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of parent IDs of comments to retrieve children for. */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of parent IDs of comments *not* to retrieve children for. */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Search term(s) to retrieve matching comments for. */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Comment status to limit results by. */
  status?: InputMaybe<Scalars["String"]["input"]>;
  /** Include comments for a specific user ID. */
  userId?: InputMaybe<Scalars["ID"]["input"]>;
};

/** Connection between the User type and the EnqueuedScript type */
export type UserToEnqueuedScriptConnection = Connection &
  EnqueuedScriptConnection & {
    __typename?: "UserToEnqueuedScriptConnection";
    /** Edges for the UserToEnqueuedScriptConnection connection */
    edges: Array<UserToEnqueuedScriptConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<EnqueuedScript>;
    /** Information about pagination in a connection. */
    pageInfo: UserToEnqueuedScriptConnectionPageInfo;
  };

/** An edge in a connection */
export type UserToEnqueuedScriptConnectionEdge = Edge &
  EnqueuedScriptConnectionEdge & {
    __typename?: "UserToEnqueuedScriptConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: EnqueuedScript;
  };

/** Page Info on the &quot;UserToEnqueuedScriptConnection&quot; */
export type UserToEnqueuedScriptConnectionPageInfo =
  EnqueuedScriptConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "UserToEnqueuedScriptConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Connection between the User type and the EnqueuedStylesheet type */
export type UserToEnqueuedStylesheetConnection = Connection &
  EnqueuedStylesheetConnection & {
    __typename?: "UserToEnqueuedStylesheetConnection";
    /** Edges for the UserToEnqueuedStylesheetConnection connection */
    edges: Array<UserToEnqueuedStylesheetConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<EnqueuedStylesheet>;
    /** Information about pagination in a connection. */
    pageInfo: UserToEnqueuedStylesheetConnectionPageInfo;
  };

/** An edge in a connection */
export type UserToEnqueuedStylesheetConnectionEdge = Edge &
  EnqueuedStylesheetConnectionEdge & {
    __typename?: "UserToEnqueuedStylesheetConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: EnqueuedStylesheet;
  };

/** Page Info on the &quot;UserToEnqueuedStylesheetConnection&quot; */
export type UserToEnqueuedStylesheetConnectionPageInfo =
  EnqueuedStylesheetConnectionPageInfo &
    PageInfo &
    WpPageInfo & {
      __typename?: "UserToEnqueuedStylesheetConnectionPageInfo";
      /** When paginating forwards, the cursor to continue. */
      endCursor?: Maybe<Scalars["String"]["output"]>;
      /** When paginating forwards, are there more items? */
      hasNextPage: Scalars["Boolean"]["output"];
      /** When paginating backwards, are there more items? */
      hasPreviousPage: Scalars["Boolean"]["output"];
      /** Raw schema for page */
      seo?: Maybe<SeoPostTypePageInfo>;
      /** When paginating backwards, the cursor to continue. */
      startCursor?: Maybe<Scalars["String"]["output"]>;
    };

/** Connection between the User type and the mediaItem type */
export type UserToMediaItemConnection = Connection &
  MediaItemConnection & {
    __typename?: "UserToMediaItemConnection";
    /** Edges for the UserToMediaItemConnection connection */
    edges: Array<UserToMediaItemConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<MediaItem>;
    /** Information about pagination in a connection. */
    pageInfo: UserToMediaItemConnectionPageInfo;
  };

/** An edge in a connection */
export type UserToMediaItemConnectionEdge = Edge &
  MediaItemConnectionEdge & {
    __typename?: "UserToMediaItemConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: MediaItem;
  };

/** Page Info on the &quot;UserToMediaItemConnection&quot; */
export type UserToMediaItemConnectionPageInfo = MediaItemConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "UserToMediaItemConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the UserToMediaItemConnection connection */
export type UserToMediaItemConnectionWhereArgs = {
  /** The user that's connected as the author of the object. Use the userId for the author object. */
  author?: InputMaybe<Scalars["Int"]["input"]>;
  /** Find objects connected to author(s) in the array of author's userIds */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Find objects connected to the author by the author's nicename */
  authorName?: InputMaybe<Scalars["String"]["input"]>;
  /** Find objects NOT connected to author(s) in the array of author's userIds */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the User type and the page type */
export type UserToPageConnection = Connection &
  PageConnection & {
    __typename?: "UserToPageConnection";
    /** Edges for the UserToPageConnection connection */
    edges: Array<UserToPageConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Page>;
    /** Information about pagination in a connection. */
    pageInfo: UserToPageConnectionPageInfo;
  };

/** An edge in a connection */
export type UserToPageConnectionEdge = Edge &
  PageConnectionEdge & {
    __typename?: "UserToPageConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Page;
  };

/** Page Info on the &quot;UserToPageConnection&quot; */
export type UserToPageConnectionPageInfo = PageConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "UserToPageConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the UserToPageConnection connection */
export type UserToPageConnectionWhereArgs = {
  /** The user that's connected as the author of the object. Use the userId for the author object. */
  author?: InputMaybe<Scalars["Int"]["input"]>;
  /** Find objects connected to author(s) in the array of author's userIds */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Find objects connected to the author by the author's nicename */
  authorName?: InputMaybe<Scalars["String"]["input"]>;
  /** Find objects NOT connected to author(s) in the array of author's userIds */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the User type and the post type */
export type UserToPostConnection = Connection &
  PostConnection & {
    __typename?: "UserToPostConnection";
    /** Edges for the UserToPostConnection connection */
    edges: Array<UserToPostConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<Post>;
    /** Information about pagination in a connection. */
    pageInfo: UserToPostConnectionPageInfo;
  };

/** An edge in a connection */
export type UserToPostConnectionEdge = Edge &
  PostConnectionEdge & {
    __typename?: "UserToPostConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: Post;
  };

/** Page Info on the &quot;UserToPostConnection&quot; */
export type UserToPostConnectionPageInfo = PageInfo &
  PostConnectionPageInfo &
  WpPageInfo & {
    __typename?: "UserToPostConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the UserToPostConnection connection */
export type UserToPostConnectionWhereArgs = {
  /** The user that's connected as the author of the object. Use the userId for the author object. */
  author?: InputMaybe<Scalars["Int"]["input"]>;
  /** Find objects connected to author(s) in the array of author's userIds */
  authorIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Find objects connected to the author by the author's nicename */
  authorName?: InputMaybe<Scalars["String"]["input"]>;
  /** Find objects NOT connected to author(s) in the array of author's userIds */
  authorNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Category ID */
  categoryId?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of category IDs, used to display objects from one category OR another */
  categoryIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Use Category Slug */
  categoryName?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of category IDs, used to display objects from one category OR another */
  categoryNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Tag Slug */
  tag?: InputMaybe<Scalars["String"]["input"]>;
  /** Use Tag ID */
  tagId?: InputMaybe<Scalars["String"]["input"]>;
  /** Array of tag IDs, used to display objects from one tag OR another */
  tagIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of tag IDs, used to display objects from one tag OR another */
  tagNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Array of tag slugs, used to display objects from one tag AND another */
  tagSlugAnd?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Array of tag slugs, used to include objects in ANY specified tags */
  tagSlugIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the User type and the ContentNode type */
export type UserToRevisionsConnection = Connection &
  ContentNodeConnection & {
    __typename?: "UserToRevisionsConnection";
    /** Edges for the UserToRevisionsConnection connection */
    edges: Array<UserToRevisionsConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<ContentNode>;
    /** Information about pagination in a connection. */
    pageInfo: UserToRevisionsConnectionPageInfo;
  };

/** An edge in a connection */
export type UserToRevisionsConnectionEdge = ContentNodeConnectionEdge &
  Edge & {
    __typename?: "UserToRevisionsConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: ContentNode;
  };

/** Page Info on the &quot;UserToRevisionsConnection&quot; */
export type UserToRevisionsConnectionPageInfo = ContentNodeConnectionPageInfo &
  PageInfo &
  WpPageInfo & {
    __typename?: "UserToRevisionsConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Arguments for filtering the UserToRevisionsConnection connection */
export type UserToRevisionsConnectionWhereArgs = {
  /** The Types of content to filter */
  contentTypes?: InputMaybe<Array<InputMaybe<ContentTypeEnum>>>;
  /** Filter the connection based on dates */
  dateQuery?: InputMaybe<DateQueryInput>;
  /** True for objects with passwords; False for objects without passwords; null for all objects with or without passwords */
  hasPassword?: InputMaybe<Scalars["Boolean"]["input"]>;
  /** Specific database ID of the object */
  id?: InputMaybe<Scalars["Int"]["input"]>;
  /** Array of IDs for the objects to retrieve */
  in?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Get objects with a specific mimeType property */
  mimeType?: InputMaybe<MimeTypeEnum>;
  /** Slug / post_name of the object */
  name?: InputMaybe<Scalars["String"]["input"]>;
  /** Specify objects to retrieve. Use slugs */
  nameIn?: InputMaybe<Array<InputMaybe<Scalars["String"]["input"]>>>;
  /** Specify IDs NOT to retrieve. If this is used in the same query as "in", it will be ignored */
  notIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** What parameter to use to order the objects by. */
  orderby?: InputMaybe<Array<InputMaybe<PostObjectsConnectionOrderbyInput>>>;
  /** Use ID to return only children. Use 0 to return only top-level items */
  parent?: InputMaybe<Scalars["ID"]["input"]>;
  /** Specify objects whose parent is in an array */
  parentIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Specify posts whose parent is not in an array */
  parentNotIn?: InputMaybe<Array<InputMaybe<Scalars["ID"]["input"]>>>;
  /** Show posts with a specific password. */
  password?: InputMaybe<Scalars["String"]["input"]>;
  /** Show Posts based on a keyword search */
  search?: InputMaybe<Scalars["String"]["input"]>;
  /** Retrieve posts where post status is in an array. */
  stati?: InputMaybe<Array<InputMaybe<PostStatusEnum>>>;
  /** Show posts with a specific status. */
  status?: InputMaybe<PostStatusEnum>;
  /** Title of the object */
  title?: InputMaybe<Scalars["String"]["input"]>;
};

/** Connection between the User type and the UserRole type */
export type UserToUserRoleConnection = Connection &
  UserRoleConnection & {
    __typename?: "UserToUserRoleConnection";
    /** Edges for the UserToUserRoleConnection connection */
    edges: Array<UserToUserRoleConnectionEdge>;
    /** The nodes of the connection, without the edges */
    nodes: Array<UserRole>;
    /** Information about pagination in a connection. */
    pageInfo: UserToUserRoleConnectionPageInfo;
  };

/** An edge in a connection */
export type UserToUserRoleConnectionEdge = Edge &
  UserRoleConnectionEdge & {
    __typename?: "UserToUserRoleConnectionEdge";
    /** A cursor for use in pagination */
    cursor?: Maybe<Scalars["String"]["output"]>;
    /** The item at the end of the edge */
    node: UserRole;
  };

/** Page Info on the &quot;UserToUserRoleConnection&quot; */
export type UserToUserRoleConnectionPageInfo = PageInfo &
  UserRoleConnectionPageInfo &
  WpPageInfo & {
    __typename?: "UserToUserRoleConnectionPageInfo";
    /** When paginating forwards, the cursor to continue. */
    endCursor?: Maybe<Scalars["String"]["output"]>;
    /** When paginating forwards, are there more items? */
    hasNextPage: Scalars["Boolean"]["output"];
    /** When paginating backwards, are there more items? */
    hasPreviousPage: Scalars["Boolean"]["output"];
    /** Raw schema for page */
    seo?: Maybe<SeoPostTypePageInfo>;
    /** When paginating backwards, the cursor to continue. */
    startCursor?: Maybe<Scalars["String"]["output"]>;
  };

/** Field to order the connection by */
export enum UsersConnectionOrderbyEnum {
  /** Order by display name */
  DisplayName = "DISPLAY_NAME",
  /** Order by email address */
  Email = "EMAIL",
  /** Order by login */
  Login = "LOGIN",
  /** Preserve the login order given in the LOGIN_IN array */
  LoginIn = "LOGIN_IN",
  /** Order by nice name */
  NiceName = "NICE_NAME",
  /** Preserve the nice name order given in the NICE_NAME_IN array */
  NiceNameIn = "NICE_NAME_IN",
  /** Order by registration date */
  Registered = "REGISTERED",
  /** Order by URL */
  Url = "URL",
}

/** Options for ordering the connection */
export type UsersConnectionOrderbyInput = {
  /** The field name used to sort the results. */
  field: UsersConnectionOrderbyEnum;
  /** The cardinality of the order of the connection */
  order?: InputMaybe<OrderEnum>;
};

/** Column used for searching for users. */
export enum UsersConnectionSearchColumnEnum {
  /** The user's email address. */
  Email = "EMAIL",
  /** The globally unique ID. */
  Id = "ID",
  /** The username the User uses to login with. */
  Login = "LOGIN",
  /** A URL-friendly name for the user. The default is the user's username. */
  Nicename = "NICENAME",
  /** The URL of the user's website. */
  Url = "URL",
}

/** Information about pagination in a connection. */
export type WpPageInfo = {
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars["String"]["output"]>;
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars["Boolean"]["output"];
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars["Boolean"]["output"];
  /** Raw schema for page */
  seo?: Maybe<SeoPostTypePageInfo>;
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars["String"]["output"]>;
};

/** The writing setting type */
export type WritingSettings = {
  __typename?: "WritingSettings";
  /** Default post category. */
  defaultCategory?: Maybe<Scalars["Int"]["output"]>;
  /** Default post format. */
  defaultPostFormat?: Maybe<Scalars["String"]["output"]>;
  /** Convert emoticons like :-) and :-P to graphics on display. */
  useSmilies?: Maybe<Scalars["Boolean"]["output"]>;
};
