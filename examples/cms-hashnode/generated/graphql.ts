import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core'
export type Maybe<T> = T | null
export type InputMaybe<T> = Maybe<T>
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K]
}
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>
}
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>
}
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T
> = { [_ in K]?: never }
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never
    }
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string }
  String: { input: string; output: string }
  Boolean: { input: boolean; output: boolean }
  Int: { input: number; output: number }
  Float: { input: number; output: number }
  DateTime: { input: string; output: string }
  ObjectId: { input: string; output: string }
}

export type AddCommentInput = {
  contentMarkdown: Scalars['String']['input']
  postId: Scalars['ID']['input']
}

export type AddCommentPayload = {
  __typename?: 'AddCommentPayload'
  comment?: Maybe<Comment>
}

export type AddPostToSeriesInput = {
  /** The ID of the post to be added to the series. */
  postId: Scalars['ObjectId']['input']
  /** The ID of the series to which the post is to be added. */
  seriesId: Scalars['ObjectId']['input']
}

export type AddPostToSeriesPayload = {
  __typename?: 'AddPostToSeriesPayload'
  /** The series to which the post was added. */
  series?: Maybe<Series>
}

export type AddReplyInput = {
  commentId: Scalars['ID']['input']
  contentMarkdown: Scalars['String']['input']
}

export type AddReplyPayload = {
  __typename?: 'AddReplyPayload'
  reply?: Maybe<Reply>
}

/**
 * Contains the flag indicating if the audio blog feature is enabled or not.
 * User can enable or disable the audio blog feature from the publication settings.
 * Shows audio player on blogs if enabled.
 */
export type AudioBlogFeature = Feature & {
  __typename?: 'AudioBlogFeature'
  /** A flag indicating if the audio blog feature is enabled or not. */
  isEnabled: Scalars['Boolean']['output']
  /** The voice type for the audio blog. */
  voiceType: AudioBlogVoiceType
}

/** The voice type for the audio blog. */
export enum AudioBlogVoiceType {
  /** Enum for the female voice type of the audio blog. */
  Female = 'FEMALE',
  /** Enum for the male voice type of the audio blog. */
  Male = 'MALE',
}

/** Used when Audioblog feature is enabled. Contains URLs to the audioblog of the post. */
export type AudioUrls = {
  __typename?: 'AudioUrls'
  /** Female version of audio url of the post. */
  female?: Maybe<Scalars['String']['output']>
  /** Male version of audio url of the post. */
  male?: Maybe<Scalars['String']['output']>
}

/** The status of the backup i.e., success or failure. */
export enum BackupStatus {
  /** The backup failed. */
  Failed = 'failed',
  /** The backup was successful. */
  Success = 'success',
}

/** A badge that the user has earned. */
export type Badge = Node & {
  __typename?: 'Badge'
  /** The date the badge was earned. */
  dateAssigned?: Maybe<Scalars['DateTime']['output']>
  /** The description of the badge. */
  description?: Maybe<Scalars['String']['output']>
  /** The ID of the badge. */
  id: Scalars['ID']['output']
  /** The image of the badge. */
  image: Scalars['String']['output']
  /** Link to badge page on Hashnode. */
  infoURL?: Maybe<Scalars['String']['output']>
  /** The name of the badge. */
  name: Scalars['String']['output']
  /** A flag to determine if the badge is hidden. */
  suppressed?: Maybe<Scalars['Boolean']['output']>
}

/**
 * Contains basic information about the beta feature.
 * A beta feature is a feature that is not yet released to all users.
 */
export type BetaFeature = Node & {
  __typename?: 'BetaFeature'
  /** The description of the beta feature. */
  description?: Maybe<Scalars['String']['output']>
  /** The date the beta feature was created. */
  enabled: Scalars['Boolean']['output']
  /** The ID of the beta feature. */
  id: Scalars['ID']['output']
  /** The key of the beta feature. */
  key: Scalars['String']['output']
  /** The title of the beta feature. */
  title?: Maybe<Scalars['String']['output']>
  /** The url of the beta feature. */
  url?: Maybe<Scalars['String']['output']>
}

/**
 * Contains basic information about the comment.
 * A comment is a response to a post.
 */
export type Comment = Node & {
  __typename?: 'Comment'
  /** The author of the comment. */
  author: User
  /** The content of the comment in markdown and html format. */
  content: Content
  /** The date the comment was created. */
  dateAdded: Scalars['DateTime']['output']
  /** The ID of the comment. */
  id: Scalars['ID']['output']
  /** Total number of reactions on the comment by the authenticated user. User must be authenticated to use this field. */
  myTotalReactions: Scalars['Int']['output']
  /** Returns a list of replies to the comment. */
  replies: CommentReplyConnection
  /** A unique string identifying the comment. Used as element id in the DOM on hashnode blogs. */
  stamp?: Maybe<Scalars['String']['output']>
  /** Total number of reactions on the comment. Reactions are hearts added to any comment. */
  totalReactions: Scalars['Int']['output']
}

/**
 * Contains basic information about the comment.
 * A comment is a response to a post.
 */
export type CommentRepliesArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  first: Scalars['Int']['input']
}

/**
 * Connection to get list of replies to a comment.
 * Returns a list of edges which contains the posts in publication and cursor to the last item of the previous page.
 */
export type CommentReplyConnection = Connection & {
  __typename?: 'CommentReplyConnection'
  /**
   * A list of edges containing nodes in the connection.
   * A node contains a reply to a comment.
   */
  edges: Array<CommentReplyEdge>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
  /** The total number of documents in the connection. */
  totalDocuments: Scalars['Int']['output']
}

/** An edge that contains a node of type reply and cursor to the node. */
export type CommentReplyEdge = Edge & {
  __typename?: 'CommentReplyEdge'
  /** A cursor to the last item of the previous page. */
  cursor: Scalars['String']['output']
  /** The node containing a reply to a comment. */
  node: Reply
}

/**
 * Connection to get list of top commenters. Contains a list of edges containing nodes.
 * Each node is a user who commented recently.
 * Page info contains information about pagination like hasNextPage and endCursor.
 */
export type CommenterUserConnection = Connection & {
  __typename?: 'CommenterUserConnection'
  /** A list of edges of commenters. */
  edges: Array<UserEdge>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/**
 * Connection to get list of items.
 * Returns a list of edges which contains the items and cursor to the last item of the previous page.
 * This is a common interface for all connections.
 */
export type Connection = {
  /** A list of edges of items connection. */
  edges: Array<Edge>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

export type Content = {
  __typename?: 'Content'
  /** The HTML version of the content. */
  html: Scalars['String']['output']
  /** The Markdown version of the content. */
  markdown: Scalars['String']['output']
  /** The text version from sanitized html content. HTML tags are stripped and only text is returned. */
  text: Scalars['String']['output']
}

/** Contains information about cover image options of the post. Like URL of the cover image, attribution, etc. */
export type CoverImageOptionsInput = {
  /** Information about the cover image attribution. */
  coverImageAttribution?: InputMaybe<Scalars['String']['input']>
  /** The name of the cover image photographer, used when cover was chosen from unsplash. */
  coverImagePhotographer?: InputMaybe<Scalars['String']['input']>
  /** The URL of the cover image. */
  coverImageURL?: InputMaybe<Scalars['String']['input']>
  /** A flag to indicate if the cover attribution is hidden, used when cover was chosen from unsplash. */
  isCoverAttributionHidden?: InputMaybe<Scalars['Boolean']['input']>
  /** A flag to indicate if the cover image is sticked to bottom. */
  stickCoverToBottom?: InputMaybe<Scalars['Boolean']['input']>
}

export type CreateWebhookInput = {
  events: Array<WebhookEvent>
  publicationId: Scalars['ID']['input']
  secret: Scalars['String']['input']
  url: Scalars['String']['input']
}

export type CreateWebhookPayload = {
  __typename?: 'CreateWebhookPayload'
  webhook?: Maybe<Webhook>
}

export type CustomCss = {
  __typename?: 'CustomCSS'
  /** Custom CSS that will be applied on the publication homepage. */
  home?: Maybe<Scalars['String']['output']>
  /** The same as `home` but minified. */
  homeMinified?: Maybe<Scalars['String']['output']>
  /** Custom CSS that will be applied on all posts of the publication. */
  post?: Maybe<Scalars['String']['output']>
  /** The same as `post` but minified. */
  postMinified?: Maybe<Scalars['String']['output']>
  /** Custom CSS that will be applied on all static pages of the publication. */
  static?: Maybe<Scalars['String']['output']>
  /** The same as `static` but minified. */
  staticMinified?: Maybe<Scalars['String']['output']>
}

export type CustomCssFeature = Feature & {
  __typename?: 'CustomCSSFeature'
  /** CSS that is not published yet. */
  draft?: Maybe<CustomCss>
  /** A flag indicating if the custom CSS feature is enabled or not. */
  isEnabled: Scalars['Boolean']['output']
  /** CSS that is live. */
  published?: Maybe<CustomCss>
}

/** Contains the publication's dark mode preferences. */
export type DarkModePreferences = {
  __typename?: 'DarkModePreferences'
  /** A flag indicating if the dark mode is enabled for the publication. */
  enabled?: Maybe<Scalars['Boolean']['output']>
  /** The custom dark mode logo of the publication. */
  logo?: Maybe<Scalars['String']['output']>
}

export type DeleteWebhookPayload = {
  __typename?: 'DeleteWebhookPayload'
  webhook?: Maybe<Webhook>
}

/** Contains the publication's domain information. */
export type DomainInfo = {
  __typename?: 'DomainInfo'
  /** The domain of the publication. */
  domain?: Maybe<DomainStatus>
  /**
   * The subdomain of the publication on hashnode.dev.
   *
   * It will redirect to you custom domain if it is present and ready.
   */
  hashnodeSubdomain?: Maybe<Scalars['String']['output']>
  /** The www prefixed domain of the publication. Says if redirect to www domain is configured. */
  wwwPrefixedDomain?: Maybe<DomainStatus>
}

/** Contains the publication's domain status. */
export type DomainStatus = {
  __typename?: 'DomainStatus'
  /** The host of the publication domain. */
  host: Scalars['String']['output']
  /** A flag indicating if the publication domain is ready. */
  ready: Scalars['Boolean']['output']
}

/**
 * Contains basic information about the draft.
 * A draft is a post that is not published yet.
 */
export type Draft = Node & {
  __typename?: 'Draft'
  /** The author of the draft. */
  author: User
  canonicalUrl?: Maybe<Scalars['String']['output']>
  /**
   * Returns the user details of the co-authors of the post.
   * Hashnode users can add up to 4 co-authors as collaborators to their posts.
   * This functionality is limited to teams publication.
   */
  coAuthors?: Maybe<Array<User>>
  /** Content of the draft in HTML and markdown */
  content?: Maybe<Content>
  /** The cover image preference of the draft. Contains cover image URL and other details. */
  coverImage?: Maybe<DraftCoverImage>
  /**
   * The date the draft was updated.
   * @deprecated Use updatedAt instead. Will be removed on 26/12/2023.
   */
  dateUpdated: Scalars['DateTime']['output']
  /** Draft feature-related fields. */
  features: DraftFeatures
  /** The ID of the draft. */
  id: Scalars['ID']['output']
  /** Information about the last backup of the draft. */
  lastBackup?: Maybe<DraftBackup>
  /** The date the draft last failed to back up. */
  lastFailedBackupAt?: Maybe<Scalars['DateTime']['output']>
  /** The date the draft was last successfully backed up. */
  lastSuccessfulBackupAt?: Maybe<Scalars['DateTime']['output']>
  /** OG meta-data of the draft. Contains image url used in open graph meta tags. */
  ogMetaData?: Maybe<OpenGraphMetaData>
  readTimeInMinutes: Scalars['Int']['output']
  /** SEO information of the draft. Contains title and description used in meta tags. */
  seo?: Maybe<Seo>
  /** Information of the series the draft belongs to. */
  series?: Maybe<Series>
  settings: DraftSettings
  slug: Scalars['String']['output']
  /** The subtitle of the draft. It would become the subtitle of the post when published. */
  subtitle?: Maybe<Scalars['String']['output']>
  /** Returns list of tags added to the draft. Contains tag id, name, slug, etc. */
  tags: Array<Tag>
  /** The title of the draft. It would become the title of the post when published. */
  title?: Maybe<Scalars['String']['output']>
  updatedAt: Scalars['DateTime']['output']
}

export type DraftBackup = {
  __typename?: 'DraftBackup'
  /** The date the backup was created. */
  at?: Maybe<Scalars['DateTime']['output']>
  /** The status of the backup i.e., success or failure. */
  status?: Maybe<BackupStatus>
}

/**
 * Connection to get list of drafts.
 * Returns a list of edges which contains the draft and cursor to the last item of the previous page.
 */
export type DraftConnection = Connection & {
  __typename?: 'DraftConnection'
  /** A list of edges of drafts connection. */
  edges: Array<DraftEdge>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
  /** The total number of documents in the connection. */
  totalDocuments: Scalars['Int']['output']
}

/** Contains information about the cover image of the draft. */
export type DraftCoverImage = {
  __typename?: 'DraftCoverImage'
  /** Provides attribution information for the cover image, if available. */
  attribution?: Maybe<Scalars['String']['output']>
  /** True if the image attribution should be hidden. */
  isAttributionHidden: Scalars['Boolean']['output']
  /** The name of the photographer who captured the cover image. */
  photographer?: Maybe<Scalars['String']['output']>
  /** The URL of the cover image. */
  url: Scalars['String']['output']
}

/** An edge that contains a node of type draft and cursor to the node. */
export type DraftEdge = Edge & {
  __typename?: 'DraftEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** A node in the connection containing a draft. */
  node: Draft
}

export type DraftFeatures = {
  __typename?: 'DraftFeatures'
  tableOfContents: TableOfContentsFeature
}

export type DraftSettings = {
  __typename?: 'DraftSettings'
  /** A flag to indicate if the comments are disabled for the post. */
  disableComments: Scalars['Boolean']['output']
  /** Wether or not the post is hidden from the Hashnode community. */
  isDelisted: Scalars['Boolean']['output']
  /** A flag to indicate if the cover image is shown below title of the post. Default position of cover is top of title. */
  stickCoverToBottom: Scalars['Boolean']['output']
}

/**
 * An edge that contains a node and cursor to the node.
 * This is a common interface for all edges.
 */
export type Edge = {
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** A node in the connection. */
  node: Node
}

/** The input for the email import acknowledgement mutation. */
export type EmailCurrentImport = {
  __typename?: 'EmailCurrentImport'
  /** The number of subscribers that have attempted to import */
  attemptedToImport?: Maybe<Scalars['Int']['output']>
  /** The filename of the csv file containing emails */
  filename?: Maybe<Scalars['String']['output']>
  /** The date the import started */
  importStartedAt: Scalars['DateTime']['output']
  /** The status of the import */
  status: EmailImportStatus
  /** The number of subscribers that have been successfully imported */
  successfullyImported?: Maybe<Scalars['Int']['output']>
}

/** Contains information about the email import. */
export type EmailImport = {
  __typename?: 'EmailImport'
  /** Contains information about the current import example if it is in progress or has finished, date started, etc */
  currentImport?: Maybe<EmailCurrentImport>
}

/** The status of the email import. */
export enum EmailImportStatus {
  /** There was an error during the import. */
  Failed = 'FAILED',
  /** The import has been acknowledged by the user. */
  Finished = 'FINISHED',
  /** Import has been initialized but is not yet in progress. */
  Initialized = 'INITIALIZED',
  /** Import is in progress. */
  InProgress = 'IN_PROGRESS',
  /** Import has to be reviewed by Hashnode. It is not yet reviewed. */
  InReview = 'IN_REVIEW',
  /** The has been rejected. Nothing has been imported. */
  Rejected = 'REJECTED',
  /** Import was successful. New emails have been imported. */
  Success = 'SUCCESS',
}

/** Common fields that describe a feature. */
export type Feature = {
  /** Whether the feature is enabled or not. */
  isEnabled: Scalars['Boolean']['output']
}

export type FeedFilter = {
  /** Adds a filter to return posts with maximum number of minutes required to read the post. */
  maxReadTime?: InputMaybe<Scalars['Int']['input']>
  /** Adds a filter to return posts with minimum number of minutes required to read the post. */
  minReadTime?: InputMaybe<Scalars['Int']['input']>
  /** Adds a filter to return posts with tagged with provided tags only. */
  tags?: InputMaybe<Array<Scalars['ObjectId']['input']>>
  /** The type of feed to be returned. */
  type?: InputMaybe<FeedType>
}

/**
 * Connection for posts within a feed. Contains a list of edges containing nodes.
 * Each node is a post.
 * Page info contains information about pagination like hasNextPage and endCursor.
 */
export type FeedPostConnection = Connection & {
  __typename?: 'FeedPostConnection'
  /** A list of edges containing Post information */
  edges: Array<PostEdge>
  /** Information for pagination in Post connection. */
  pageInfo: PageInfo
}

/** Contains information about type of feed to be returned. */
export enum FeedType {
  /** Returns posts which were bookmarked by the user, sorted based on recency. */
  Bookmarks = 'BOOKMARKS',
  /** Returns posts which were featured, sorted based on recency. */
  Featured = 'FEATURED',
  /**
   * Returns only posts of the users you follow or publications you have subscribed to.
   *
   * Note: You have to be authenticated to use this feed type.
   */
  Following = 'FOLLOWING',
  /**
   * Returns only posts based on users following and interactions.
   *
   * Personalised feed is curated per requesting user basis.
   */
  Personalized = 'PERSONALIZED',
  /** Returns posts which were viewed by the user, sorted based on recency. */
  ReadingHistory = 'READING_HISTORY',
  /** Returns posts which were published recently, sorted based on recency. */
  Recent = 'RECENT',
  /** Returns posts based on old personalization algorithm. */
  Relevant = 'RELEVANT',
}

export enum HttpRedirectionType {
  /** A permanent redirect that corresponds to the 308 HTTP status code. */
  Permanent = 'PERMANENT',
  /** A temporary redirect that corresponds to the 307 HTTP status code. */
  Temporary = 'TEMPORARY',
}

/**
 * Contains basic information about the tag.
 * A tag is a label that categorizes posts with similar topics.
 */
export type ITag = {
  /** Total number of users following this tag. */
  followersCount: Scalars['Int']['output']
  /** The ID of the tag. */
  id: Scalars['ID']['output']
  /** Information about the tag. Contains markdown html and text version of the tag's info. */
  info?: Maybe<Content>
  /** The logo of the tag. Shown in tag page. */
  logo?: Maybe<Scalars['String']['output']>
  /** The name of the tag. Shown in tag page. */
  name: Scalars['String']['output']
  /** Alltime usage count of this tag in posts. */
  postsCount: Scalars['Int']['output']
  /** The slug of the tag. Used to access tags feed.  Example https://hashnode.com/n/graphql */
  slug: Scalars['String']['output']
  /** The tagline of the tag. */
  tagline?: Maybe<Scalars['String']['output']>
}

/** Basic information about a user on Hashnode. */
export type IUser = {
  /** Whether or not the user is an ambassador. */
  ambassador: Scalars['Boolean']['output']
  /** The availability of the user based on tech stack and interests. Shown on the "I am available for" section in user's profile. */
  availableFor?: Maybe<Scalars['String']['output']>
  /** Returns a list of badges that the user has earned. Shown on blogs /badges page. Example - https://iamshadmirza.com/badges */
  badges: Array<Badge>
  /** The bio of the user. Visible in about me section of the user's profile. */
  bio?: Maybe<Content>
  /** The date the user joined Hashnode. */
  dateJoined?: Maybe<Scalars['DateTime']['output']>
  /** Whether or not the user is deactivated. */
  deactivated: Scalars['Boolean']['output']
  /** The users who are following this user */
  followers: UserConnection
  /** The number of users that follow the requested user. Visible in the user's profile. */
  followersCount: Scalars['Int']['output']
  /** The number of users that this user is following. Visible in the user's profile. */
  followingsCount: Scalars['Int']['output']
  /** The users which this user is following */
  follows: UserConnection
  /** The ID of the user. It can be used to identify the user. */
  id: Scalars['ID']['output']
  /** The location of the user. */
  location?: Maybe<Scalars['String']['output']>
  /** The name of the user. */
  name: Scalars['String']['output']
  /** Returns the list of posts the user has published. */
  posts: UserPostConnection
  /** The URL to the profile picture of the user. */
  profilePicture?: Maybe<Scalars['String']['output']>
  /** Publications associated with the user. Includes personal and team publications. */
  publications: UserPublicationsConnection
  /** The social media links of the user. Shown on the user's profile. */
  socialMediaLinks?: Maybe<SocialMediaLinks>
  /** The tagline of the user. Shown on the user's profile below the name. */
  tagline?: Maybe<Scalars['String']['output']>
  /** Returns a list of tags that the user follows. */
  tagsFollowing: Array<Tag>
  /** The username of the user. It is unique and tied with user's profile URL. Example - https://hashnode.com/@username */
  username: Scalars['String']['output']
}

/** Basic information about a user on Hashnode. */
export type IUserFollowersArgs = {
  page: Scalars['Int']['input']
  pageSize: Scalars['Int']['input']
}

/** Basic information about a user on Hashnode. */
export type IUserFollowsArgs = {
  page: Scalars['Int']['input']
  pageSize: Scalars['Int']['input']
}

/** Basic information about a user on Hashnode. */
export type IUserPostsArgs = {
  filter?: InputMaybe<UserPostConnectionFilter>
  page: Scalars['Int']['input']
  pageSize: Scalars['Int']['input']
  sortBy?: InputMaybe<UserPostsSort>
}

/** Basic information about a user on Hashnode. */
export type IUserPublicationsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  filter?: InputMaybe<UserPublicationsConnectionFilter>
  first: Scalars['Int']['input']
}

export type LikeCommentInput = {
  commentId: Scalars['ID']['input']
  likesCount?: InputMaybe<Scalars['Int']['input']>
}

export type LikeCommentPayload = {
  __typename?: 'LikeCommentPayload'
  comment?: Maybe<Comment>
}

export type LikePostInput = {
  likesCount?: InputMaybe<Scalars['Int']['input']>
  postId: Scalars['ID']['input']
}

export type LikePostPayload = {
  __typename?: 'LikePostPayload'
  post?: Maybe<Post>
}

/** Contains information about meta tags of the post. Used for SEO purpose. */
export type MetaTagsInput = {
  /** The description of the post used in og:description for SEO. */
  description?: InputMaybe<Scalars['String']['input']>
  /** The image URL of the post used in og:image for SEO. */
  image?: InputMaybe<Scalars['String']['input']>
  /** The title of the post used in og:title for SEO. */
  title?: InputMaybe<Scalars['String']['input']>
}

export type Mutation = {
  __typename?: 'Mutation'
  /** Adds a comment to a post. */
  addComment: AddCommentPayload
  /** Adds a post to a series. */
  addPostToSeries: AddPostToSeriesPayload
  /** Adds a reply to a comment. */
  addReply: AddReplyPayload
  createWebhook: CreateWebhookPayload
  deleteWebhook: DeleteWebhookPayload
  /** Likes a comment. */
  likeComment: LikeCommentPayload
  /** Likes a post. */
  likePost: LikePostPayload
  /** Creates a new post. */
  publishPost: PublishPostPayload
  recommendPublications: RecommendPublicationsPayload
  /** Removes a comment from a post. */
  removeComment: RemoveCommentPayload
  /** Removes a post. */
  removePost: RemovePostPayload
  removeRecommendation: RemoveRecommendationPayload
  /** Removes a reply from a comment. */
  removeReply: RemoveReplyPayload
  /**
   * Reschedule a post.
   * @deprecated Use rescheduleDraft instead. Will be taken down on 2024-02-1
   */
  reschedulePost?: Maybe<ScheduledPostPayload>
  resendWebhookRequest: ResendWebhookRequestPayload
  subscribeToNewsletter: SubscribeToNewsletterPayload
  /**
   * Update the follow state for the user that is provided via id or username.
   * If the authenticated user does not follow the user, the mutation will follow the user.
   * If the authenticated user already follows the user, the mutation will un-follow the user.
   * Only available to the authenticated user.
   */
  toggleFollowUser: ToggleFollowUserPayload
  triggerWebhookTest: TriggerWebhookTestPayload
  unsubscribeFromNewsletter: UnsubscribeFromNewsletterPayload
  /** Updates a comment on a post. */
  updateComment: UpdateCommentPayload
  updatePost: UpdatePostPayload
  /** Updates a reply */
  updateReply: UpdateReplyPayload
  updateWebhook: UpdateWebhookPayload
}

export type MutationAddCommentArgs = {
  input: AddCommentInput
}

export type MutationAddPostToSeriesArgs = {
  input: AddPostToSeriesInput
}

export type MutationAddReplyArgs = {
  input: AddReplyInput
}

export type MutationCreateWebhookArgs = {
  input: CreateWebhookInput
}

export type MutationDeleteWebhookArgs = {
  id: Scalars['ID']['input']
}

export type MutationLikeCommentArgs = {
  input: LikeCommentInput
}

export type MutationLikePostArgs = {
  input: LikePostInput
}

export type MutationPublishPostArgs = {
  input: PublishPostInput
}

export type MutationRecommendPublicationsArgs = {
  input: RecommendPublicationsInput
}

export type MutationRemoveCommentArgs = {
  input: RemoveCommentInput
}

export type MutationRemovePostArgs = {
  input: RemovePostInput
}

export type MutationRemoveRecommendationArgs = {
  input: RemoveRecommendationInput
}

export type MutationRemoveReplyArgs = {
  input: RemoveReplyInput
}

export type MutationReschedulePostArgs = {
  input: ReschedulePostInput
}

export type MutationResendWebhookRequestArgs = {
  input: ResendWebhookRequestInput
}

export type MutationSubscribeToNewsletterArgs = {
  input: SubscribeToNewsletterInput
}

export type MutationToggleFollowUserArgs = {
  id?: InputMaybe<Scalars['ID']['input']>
  username?: InputMaybe<Scalars['String']['input']>
}

export type MutationTriggerWebhookTestArgs = {
  input: TriggerWebhookTestInput
}

export type MutationUnsubscribeFromNewsletterArgs = {
  input: UnsubscribeFromNewsletterInput
}

export type MutationUpdateCommentArgs = {
  input: UpdateCommentInput
}

export type MutationUpdatePostArgs = {
  input: UpdatePostInput
}

export type MutationUpdateReplyArgs = {
  input: UpdateReplyInput
}

export type MutationUpdateWebhookArgs = {
  input: UpdateWebhookInput
}

/**
 * Basic information about the authenticated user.
 * User must be authenticated to use this type.
 */
export type MyUser = IUser &
  Node & {
    __typename?: 'MyUser'
    /**
     * Whether or not the user is an ambassador.
     * @deprecated Ambassadors program no longer active. Will be removed after 02/01/2024
     */
    ambassador: Scalars['Boolean']['output']
    /** The availability of the user based on tech stack and interests. Shown on the "I am available for" section in user's profile. */
    availableFor?: Maybe<Scalars['String']['output']>
    /** Returns a list of badges that the user has earned. Shown on blogs /badges page. Example - https://iamshadmirza.com/badges */
    badges: Array<Badge>
    /** A list of beta features that the user has access to. Only available to the authenticated user. */
    betaFeatures: Array<BetaFeature>
    /** The bio of the user. Visible in about me section of the user's profile. */
    bio?: Maybe<Content>
    /** The date the user joined Hashnode. */
    dateJoined?: Maybe<Scalars['DateTime']['output']>
    /** Whether or not the user is deactivated. */
    deactivated: Scalars['Boolean']['output']
    /** Email address of the user. Only available to the authenticated user. */
    email?: Maybe<Scalars['String']['output']>
    /** The users who are following this user */
    followers: UserConnection
    /** The number of users that follow the requested user. Visible in the user's profile. */
    followersCount: Scalars['Int']['output']
    /** The number of users that this user is following. Visible in the user's profile. */
    followingsCount: Scalars['Int']['output']
    /** The users which this user is following */
    follows: UserConnection
    /** The ID of the user. It can be used to identify the user. */
    id: Scalars['ID']['output']
    /** The location of the user. */
    location?: Maybe<Scalars['String']['output']>
    /** The name of the user. */
    name: Scalars['String']['output']
    /** Returns the list of posts the user has published. */
    posts: UserPostConnection
    /** The URL to the profile picture of the user. */
    profilePicture?: Maybe<Scalars['String']['output']>
    provider?: Maybe<Scalars['String']['output']>
    /** Publications associated with the user. Includes personal and team publications. */
    publications: UserPublicationsConnection
    /** The social media links of the user. Shown on the user's profile. */
    socialMediaLinks?: Maybe<SocialMediaLinks>
    /** The tagline of the user. Shown on the user's profile below the name. */
    tagline?: Maybe<Scalars['String']['output']>
    /** Returns a list of tags that the user follows. */
    tagsFollowing: Array<Tag>
    /** Hashnode users are subscribed to a newsletter by default. This field can be used to unsubscribe from the newsletter. Only available to the authenticated user. */
    unsubscribeCode?: Maybe<Scalars['String']['output']>
    /** The username of the user. It is unique and tied with user's profile URL. Example - https://hashnode.com/@username */
    username: Scalars['String']['output']
  }

/**
 * Basic information about the authenticated user.
 * User must be authenticated to use this type.
 */
export type MyUserFollowersArgs = {
  page: Scalars['Int']['input']
  pageSize: Scalars['Int']['input']
}

/**
 * Basic information about the authenticated user.
 * User must be authenticated to use this type.
 */
export type MyUserFollowsArgs = {
  page: Scalars['Int']['input']
  pageSize: Scalars['Int']['input']
}

/**
 * Basic information about the authenticated user.
 * User must be authenticated to use this type.
 */
export type MyUserPostsArgs = {
  filter?: InputMaybe<UserPostConnectionFilter>
  page: Scalars['Int']['input']
  pageSize: Scalars['Int']['input']
  sortBy?: InputMaybe<UserPostsSort>
}

/**
 * Basic information about the authenticated user.
 * User must be authenticated to use this type.
 */
export type MyUserPublicationsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  filter?: InputMaybe<UserPublicationsConnectionFilter>
  first: Scalars['Int']['input']
}

/**
 * Contains the flag indicating if the newsletter feature is enabled or not.
 * User can enable or disable the newsletter feature from the publication settings.
 * Shows a newsletter prompt on blog if enabled.
 */
export type NewsletterFeature = Feature & {
  __typename?: 'NewsletterFeature'
  frequency?: Maybe<NewsletterFrequency>
  /** A flag indicating if the newsletter feature is enabled or not. */
  isEnabled: Scalars['Boolean']['output']
}

export enum NewsletterFrequency {
  Asap = 'asap',
  Weekly = 'weekly',
}

export enum NewsletterSubscribeStatus {
  Pending = 'PENDING',
}

export enum NewsletterUnsubscribeStatus {
  Unsubscribed = 'UNSUBSCRIBED',
}

/** Node is a common interface for all types example User, Post, Comment, etc. */
export type Node = {
  /** The ID of the node. */
  id: Scalars['ID']['output']
}

/** Contains information to help in pagination for page based pagination. */
export type OffsetPageInfo = {
  __typename?: 'OffsetPageInfo'
  /** Indicates if there are more pages. */
  hasNextPage?: Maybe<Scalars['Boolean']['output']>
  /** Indicates if there are previous pages */
  hasPreviousPage?: Maybe<Scalars['Boolean']['output']>
  /**
   * The page after the current page.
   * Use it to build page navigation
   */
  nextPage?: Maybe<Scalars['Int']['output']>
  /**
   * The page before the current page.
   * Use it to build page navigation
   */
  previousPage?: Maybe<Scalars['Int']['output']>
}

/** Information to help in open graph related meta tags. */
export type OpenGraphMetaData = {
  __typename?: 'OpenGraphMetaData'
  /** The image used in og:image tag for SEO purposes. */
  image?: Maybe<Scalars['String']['output']>
}

/**
 * A Connection for page based pagination to get a list of items.
 * Returns a list of nodes which contains the items.
 * This is a common interface for all page connections.
 */
export type PageConnection = {
  /** A list of edges of items connection. */
  nodes: Array<Node>
  /** Information to aid in pagination. */
  pageInfo: OffsetPageInfo
}

/** Contains information to help in pagination. */
export type PageInfo = {
  __typename?: 'PageInfo'
  /**
   * The cursor of the last item in the current page.
   * Use it as the after input to query the next page.
   */
  endCursor?: Maybe<Scalars['String']['output']>
  /** Indicates if there are more pages. */
  hasNextPage?: Maybe<Scalars['Boolean']['output']>
}

/**
 * Contains the preferences publication's autogenerated pages.
 * Used to enable or disable pages like badge, newsletter and members.
 */
export type PagesPreferences = {
  __typename?: 'PagesPreferences'
  /** A flag indicating if the publication's badge page is enabled. */
  badges?: Maybe<Scalars['Boolean']['output']>
  /** A flag indicating if the publication's member page is enabled. */
  members?: Maybe<Scalars['Boolean']['output']>
  /** A flag indicating if the publication's newsletter page is enabled. */
  newsletter?: Maybe<Scalars['Boolean']['output']>
}

/** Contains basic information about the tag returned by popularTags query. */
export type PopularTag = ITag &
  Node & {
    __typename?: 'PopularTag'
    /** Total number of users following this tag. */
    followersCount: Scalars['Int']['output']
    /** The ID of the tag. */
    id: Scalars['ID']['output']
    /** Information about the tag. Contains markdown html and text version of the tag's info. */
    info?: Maybe<Content>
    /** The logo of the tag. Shown in tag page. */
    logo?: Maybe<Scalars['String']['output']>
    /** The name of the tag. Shown in tag page. */
    name: Scalars['String']['output']
    /** Alltime usage count of this tag in posts. */
    postsCount: Scalars['Int']['output']
    /** The number of posts published in the given period that use this tag. */
    postsCountInPeriod: Scalars['Int']['output']
    /** The slug of the tag. Used to access tags feed.  Example https://hashnode.com/n/graphql */
    slug: Scalars['String']['output']
    /** The tagline of the tag. */
    tagline?: Maybe<Scalars['String']['output']>
  }

/** Contains a tag and a cursor for pagination. */
export type PopularTagEdge = Edge & {
  __typename?: 'PopularTagEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The node holding the Tag information */
  node: PopularTag
}

/**
 * Contains basic information about the post.
 * A post is a published article on Hashnode.
 */
export type Post = Node & {
  __typename?: 'Post'
  /** Returns male and female audio url of the post. Available in case the Audioblog is enabled. */
  audioUrls?: Maybe<AudioUrls>
  /** Returns the user details of the author of the post. */
  author: User
  /**
   * Flag to indicate if the post is bookmarked by the requesting user.
   *
   * Returns `false` if the user is not authenticated.
   */
  bookmarked: Scalars['Boolean']['output']
  /** Brief is a short description of the post extracted from the content of the post. It's 250 characters long sanitized string. */
  brief: Scalars['String']['output']
  /** Canonical URL set by author in case of republished posts. */
  canonicalUrl?: Maybe<Scalars['String']['output']>
  /**
   * Returns the user details of the co-authors of the post.
   * Hashnode users can add up to 4 co-authors as collaborators to their posts.
   * This functionality is limited to teams publication.
   */
  coAuthors?: Maybe<Array<User>>
  /** List of users who have commented on the post. */
  commenters: PostCommenterConnection
  /** A list of comments on the post. */
  comments: PostCommentConnection
  /** Content of the post. Contains HTML and Markdown version of the post content. */
  content: Content
  /**
   * A list of contributors of the post. Contributors are users who have commented or replied to the post.
   * @deprecated Will be removed on 10th Oct 2023. Use `commenters` instead.
   */
  contributors: Array<User>
  /** The cover image preference of the post. Contains cover image URL and other details. */
  coverImage?: Maybe<PostCoverImage>
  /** Unique ID to identify post, used internally by hashnode. */
  cuid?: Maybe<Scalars['String']['output']>
  /** Flag to indicate if the post is featured on Hashnode feed. */
  featured: Scalars['Boolean']['output']
  /** The date and time the post was featured. Used along with featured flag to determine if the post is featured. */
  featuredAt?: Maybe<Scalars['DateTime']['output']>
  /** Post feature-related fields. */
  features: PostFeatures
  /** A flag to indicate if the post contains LaTeX. Latex is used to write mathematical equations. */
  hasLatexInPost: Scalars['Boolean']['output']
  /** The ID of the post. Used to uniquely identify the post. */
  id: Scalars['ID']['output']
  /** Wether or not the post has automatically been published via RSS feed. */
  isAutoPublishedFromRSS: Scalars['Boolean']['output']
  /**
   * Wether or not the authenticated user is following this post.
   *
   * Returns `null` if the user is not authenticated.
   */
  isFollowed?: Maybe<Scalars['Boolean']['output']>
  /** A list of users who liked the post. */
  likedBy: PostLikerConnection
  /** OG meta-data of the post. Contains image url used in open graph meta tags. */
  ogMetaData?: Maybe<OpenGraphMetaData>
  /** Preference settings for the post. Contains information about if the post is pinned to blog, comments are disabled, etc. */
  preferences: PostPreferences
  /** The publication the post belongs to. */
  publication?: Maybe<Publication>
  /** The date and time the post was published. */
  publishedAt: Scalars['DateTime']['output']
  /** The number of hearts on the post. Shows how many users liked the post. */
  reactionCount: Scalars['Int']['output']
  /** The estimated time to read the post in minutes. */
  readTimeInMinutes: Scalars['Int']['output']
  /** The number of replies on the post. */
  replyCount: Scalars['Int']['output']
  /** The number of comments on the post. */
  responseCount: Scalars['Int']['output']
  /** SEO information of the post. Contains title and description used in meta tags. */
  seo?: Maybe<Seo>
  /** Information of the series the post belongs to. */
  series?: Maybe<Series>
  /** The slug of the post. Used as address of the post on blog. Example - https://johndoe.com/my-post-slug */
  slug: Scalars['String']['output']
  /** The subtitle of the post. Subtitle is a short description of the post which is also used in SEO if meta tags are not provided. */
  subtitle?: Maybe<Scalars['String']['output']>
  /** Returns list of tags added to the post. Contains tag id, name, slug, etc. */
  tags?: Maybe<Array<Tag>>
  /** The title of the post. */
  title: Scalars['String']['output']
  /** The date and time the post was last updated. */
  updatedAt?: Maybe<Scalars['DateTime']['output']>
  /** Complete URL of the post including the domain name. Example - https://johndoe.com/my-post-slug */
  url: Scalars['String']['output']
  /** The number of views on the post. Can be used to show the popularity of the post. */
  views: Scalars['Int']['output']
}

/**
 * Contains basic information about the post.
 * A post is a published article on Hashnode.
 */
export type PostCommentersArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  first: Scalars['Int']['input']
  sortBy?: InputMaybe<PostCommenterSortBy>
}

/**
 * Contains basic information about the post.
 * A post is a published article on Hashnode.
 */
export type PostCommentsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  first: Scalars['Int']['input']
  sortBy?: InputMaybe<PostCommentSortBy>
}

/**
 * Contains basic information about the post.
 * A post is a published article on Hashnode.
 */
export type PostLikedByArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  filter?: InputMaybe<PostLikerFilter>
  first: Scalars['Int']['input']
}

/** The author type of a post from a user's perspective */
export enum PostAuthorType {
  /** The user has authored the post. */
  Author = 'AUTHOR',
  /** The user is a co-author of post. */
  CoAuthor = 'CO_AUTHOR',
}

export type PostBadge = Node & {
  __typename?: 'PostBadge'
  /** Unique identifier. */
  id: Scalars['ID']['output']
  /** The type of the badge. */
  type: PostBadgeType
}

export enum PostBadgeType {
  FeaturedDailyDotDev = 'FEATURED_DAILY_DOT_DEV',
  FeaturedHashnode = 'FEATURED_HASHNODE',
}

export type PostBadgesFeature = Feature & {
  __typename?: 'PostBadgesFeature'
  /** Wether or not the user has chosen to show badges on the post. */
  isEnabled: Scalars['Boolean']['output']
  items: Array<PostBadge>
}

/**
 * Connection for comments. Contains a list of edges containing nodes.
 * Each node holds a comment.
 * Page info contains information about pagination like hasNextPage and endCursor.
 * Total documents contains the total number of comments.
 */
export type PostCommentConnection = Connection & {
  __typename?: 'PostCommentConnection'
  /** A list of edges containing comments as nodes. */
  edges: Array<PostCommentEdge>
  /** Information about pagination in a connection. */
  pageInfo: PageInfo
  /** Total number of nodes available i.e. number of comments. */
  totalDocuments: Scalars['Int']['output']
}

/** A comment on the post. Contains information about the content of the comment, user who commented, etc. */
export type PostCommentEdge = Edge & {
  __typename?: 'PostCommentEdge'
  /** The cursor for this node used for pagination. */
  cursor: Scalars['String']['output']
  /** The comment on the post. */
  node: Comment
}

/** Sorting options for comments. Used to sort comments by top or recent. */
export enum PostCommentSortBy {
  /** Sorts comments by recency. */
  Recent = 'RECENT',
  /** Sorts comments by popularity. */
  Top = 'TOP',
}

/**
 * Connection for commenters (users). Contains a list of edges containing nodes.
 * Each node holds commenter.
 * Page info contains information about pagination like hasNextPage and endCursor.
 * Total documents contains the total number of commenters.
 */
export type PostCommenterConnection = Connection & {
  __typename?: 'PostCommenterConnection'
  /** A list of edges containing commenters as nodes. */
  edges: Array<PostCommenterEdge>
  /** Information about pagination in a connection. */
  pageInfo: PageInfo
  /** Total number of nodes available i.e. number of commenters. */
  totalDocuments: Scalars['Int']['output']
}

/** A commenter on the post. Contains information about the user who commented. */
export type PostCommenterEdge = Edge & {
  __typename?: 'PostCommenterEdge'
  /** The cursor for this node used for pagination. */
  cursor: Scalars['String']['output']
  /** The commenter on the post. */
  node: User
}

/** Sorting options for commenters. Used to sort commenters by popularity or recency. */
export enum PostCommenterSortBy {
  /** Sorts commenters by popularity. */
  Popular = 'POPULAR',
  /** Sorts commenters by recency. */
  Recent = 'RECENT',
}

/** Contains information about the cover image of the post. */
export type PostCoverImage = {
  __typename?: 'PostCoverImage'
  /** Provides attribution information for the cover image, if available. */
  attribution?: Maybe<Scalars['String']['output']>
  /** True if the image attribution should be hidden. */
  isAttributionHidden: Scalars['Boolean']['output']
  /** Indicates whether the cover image is in portrait orientation. */
  isPortrait: Scalars['Boolean']['output']
  /** The name of the photographer who captured the cover image. */
  photographer?: Maybe<Scalars['String']['output']>
  /** The URL of the cover image. */
  url: Scalars['String']['output']
}

/** Contains a post and a cursor for pagination. */
export type PostEdge = Edge & {
  __typename?: 'PostEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The node holding the Post information */
  node: Post
}

export type PostFeatures = {
  __typename?: 'PostFeatures'
  badges: PostBadgesFeature
  tableOfContents: TableOfContentsFeature
}

/**
 * Connection for users who liked the post. Contains a list of edges containing nodes.
 * Each node is a user who liked the post.
 * Page info contains information about pagination like hasNextPage and endCursor.
 * Total documents contains the total number of users who liked the post.
 */
export type PostLikerConnection = Connection & {
  __typename?: 'PostLikerConnection'
  /** A list of edges containing users as nodes */
  edges: Array<PostLikerEdge>
  /** Information about pagination in a connection. */
  pageInfo: PageInfo
  /** Total number of nodes available i.e. number of users who liked the post. */
  totalDocuments: Scalars['Int']['output']
}

/** A user who liked the post. Contains information about the user and number of reactions added by the user. */
export type PostLikerEdge = Edge & {
  __typename?: 'PostLikerEdge'
  /** The cursor for this node used for pagination. */
  cursor: Scalars['String']['output']
  /** The user who liked the post. */
  node: User
  /** The number of reaction added by the user. */
  reactionCount: Scalars['Int']['output']
}

export type PostLikerFilter = {
  /** Only return likes from users with the given user IDs. */
  userIds?: InputMaybe<Array<Scalars['ID']['input']>>
}

/** Contains Post preferences. Used to determine if the post is pinned to blog, comments are disabled, or cover image is sticked to bottom. */
export type PostPreferences = {
  __typename?: 'PostPreferences'
  /** A flag to indicate if the comments are disabled for the post. */
  disableComments: Scalars['Boolean']['output']
  /** Wether or not the post is hidden from the Hashnode community. */
  isDelisted: Scalars['Boolean']['output']
  /** A flag to indicate if the post is pinned to blog. Pinned post is shown on top of the blog. */
  pinnedToBlog: Scalars['Boolean']['output']
  /** A flag to indicate if the cover image is shown below title of the post. Default position of cover is top of title. */
  stickCoverToBottom: Scalars['Boolean']['output']
}

/** Contains the publication's preferences for layout, theme and other personalisations. */
export type Preferences = {
  __typename?: 'Preferences'
  /** The publication's darkmode preferences. Can be used to load blog in dark mode by default and add a custom dark mode logo. */
  darkMode?: Maybe<DarkModePreferences>
  /** A flag indicating if the hashnode's footer branding is disabled for the publication. */
  disableFooterBranding?: Maybe<Scalars['Boolean']['output']>
  /** An object containing pages enabled for the publication. */
  enabledPages?: Maybe<PagesPreferences>
  /** A flag indicating if subscription popup needs to be shown to be shown for the publication */
  isSubscriptionModalDisabled?: Maybe<Scalars['Boolean']['output']>
  /** The selected publication's layout, can be stacked, grid or magazine. */
  layout?: Maybe<PublicationLayout>
  /** The publication's logo url. */
  logo?: Maybe<Scalars['String']['output']>
  /** The items in the publication's navigation bar. */
  navbarItems: Array<PublicationNavbarItem>
}

/**
 * Contains basic information about the publication.
 * A publication is a blog that can be created for a user or a team.
 */
export type Publication = Node & {
  __typename?: 'Publication'
  /** The about section of the publication. */
  about?: Maybe<Content>
  /** The author who owns the publication. */
  author: User
  /** The canonical URL of the publication. */
  canonicalURL: Scalars['String']['output']
  /** The description of the publication, used in og:description meta tag. Fall backs to Publication.about.text if no SEO description is provided. */
  descriptionSEO?: Maybe<Scalars['String']['output']>
  /** The title of the publication. Shown in blog home page. */
  displayTitle?: Maybe<Scalars['String']['output']>
  /** Domain information of the publication. */
  domainInfo: DomainInfo
  /** Returns the list of drafts in the publication. */
  drafts: DraftConnection
  /** Returns the publication's email imports, used with newsletter feature. */
  emailImport?: Maybe<EmailImport>
  /** The favicon of the publication. Used in browser tab. */
  favicon?: Maybe<Scalars['String']['output']>
  /** Object containing information about beta features enabled for the publication. */
  features: PublicationFeatures
  /** Total number of followers of the publication. */
  followersCount?: Maybe<Scalars['Int']['output']>
  /** Whether the publication has earned any badges or not. */
  hasBadges: Scalars['Boolean']['output']
  /** Color code of the header color of the publication. Used to style header of blog. */
  headerColor?: Maybe<Scalars['String']['output']>
  /** The ID of the publication. */
  id: Scalars['ID']['output']
  /**
   * Summary of the contact information and information related to copyrights, usually used in German-speaking countries.
   * @deprecated Use `imprintV2` instead. Will be removed after 16/12/2023.
   */
  imprint?: Maybe<Scalars['String']['output']>
  /** Summary of the contact information and information related to copyrights, usually used in German-speaking countries. */
  imprintV2?: Maybe<Content>
  /** The integrations connected to the publication. */
  integrations?: Maybe<PublicationIntegrations>
  /** Returns true if GitHub backup is configured and active and false otherwise. */
  isGitHubBackupEnabled: Scalars['Boolean']['output']
  /** A flag to indicate if the publication is using Headless CMS. This can be used to check if the post redirect needs authentication. */
  isHeadless: Scalars['Boolean']['output']
  /** True if the publication is a team publication and false otherwise. */
  isTeam: Scalars['Boolean']['output']
  /** Links to the publication's social media profiles. */
  links?: Maybe<PublicationLinks>
  /** The meta tags associated with the publication. */
  metaTags?: Maybe<Scalars['String']['output']>
  /** Information about the publication's Open Graph metadata i.e. image. */
  ogMetaData: OpenGraphMetaData
  /** Returns the pinned post of the publication. */
  pinnedPost?: Maybe<Post>
  /** Returns the post with the given slug. */
  post?: Maybe<Post>
  /** Returns the list of posts in the publication. */
  posts: PublicationPostConnection
  /** The publication preferences around layout, theme and other personalisations. */
  preferences: Preferences
  /** Publications that are recommended by this publication. */
  recommendedPublications: Array<UserRecommendedPublicationEdge>
  /** Publications that are recommending this publication. */
  recommendingPublications: PublicationUserRecommendingPublicationConnection
  /** Configured redirection rules for the publication. */
  redirectionRules: Array<RedirectionRule>
  /** Returns the scheduled drafts of the publication. */
  scheduledDrafts: DraftConnection
  /** Returns series by slug in the publication. */
  series?: Maybe<Series>
  /** Returns the list of series in the publication. */
  seriesList: SeriesConnection
  /** Contains the publication's sponsorships information. */
  sponsorship?: Maybe<PublicationSponsorship>
  /** Returns the static page with the given slug. */
  staticPage?: Maybe<StaticPage>
  /** Returns a list of static pages in the publication. */
  staticPages: StaticPageConnection
  /** Returns the list of submitted drafts in the publication. */
  submittedDrafts: DraftConnection
  /**
   * The title of the publication.
   * Title is used as logo if logo is not provided.
   */
  title: Scalars['String']['output']
  /** The total amount of recommended publications by this publication. */
  totalRecommendedPublications: Scalars['Int']['output']
  /** The domain of the publication. Used to access publication. Example https://johndoe.com */
  url: Scalars['String']['output']
  /** Determines the structure of the post URLs. */
  urlPattern: UrlPattern
}

/**
 * Contains basic information about the publication.
 * A publication is a blog that can be created for a user or a team.
 */
export type PublicationDraftsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  filter?: InputMaybe<PublicationDraftConnectionFilter>
  first: Scalars['Int']['input']
}

/**
 * Contains basic information about the publication.
 * A publication is a blog that can be created for a user or a team.
 */
export type PublicationPostArgs = {
  slug: Scalars['String']['input']
}

/**
 * Contains basic information about the publication.
 * A publication is a blog that can be created for a user or a team.
 */
export type PublicationPostsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  filter?: InputMaybe<PublicationPostConnectionFilter>
  first: Scalars['Int']['input']
}

/**
 * Contains basic information about the publication.
 * A publication is a blog that can be created for a user or a team.
 */
export type PublicationRecommendingPublicationsArgs = {
  page: Scalars['Int']['input']
  pageSize: Scalars['Int']['input']
}

/**
 * Contains basic information about the publication.
 * A publication is a blog that can be created for a user or a team.
 */
export type PublicationScheduledDraftsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  filter?: InputMaybe<PublicationDraftConnectionFilter>
  first: Scalars['Int']['input']
}

/**
 * Contains basic information about the publication.
 * A publication is a blog that can be created for a user or a team.
 */
export type PublicationSeriesArgs = {
  slug: Scalars['String']['input']
}

/**
 * Contains basic information about the publication.
 * A publication is a blog that can be created for a user or a team.
 */
export type PublicationSeriesListArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  first: Scalars['Int']['input']
}

/**
 * Contains basic information about the publication.
 * A publication is a blog that can be created for a user or a team.
 */
export type PublicationStaticPageArgs = {
  slug: Scalars['String']['input']
}

/**
 * Contains basic information about the publication.
 * A publication is a blog that can be created for a user or a team.
 */
export type PublicationStaticPagesArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  first: Scalars['Int']['input']
}

/**
 * Contains basic information about the publication.
 * A publication is a blog that can be created for a user or a team.
 */
export type PublicationSubmittedDraftsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  filter?: InputMaybe<PublicationDraftConnectionFilter>
  first: Scalars['Int']['input']
}

/**
 * Connection to get list of drafts in publications.
 * Returns a list of edges which contains the drafts in publication and cursor to the last item of the previous page.
 */
export type PublicationDraftConnectionFilter = {
  /** Search filter will be applied to the title of a draft */
  search?: InputMaybe<Scalars['String']['input']>
}

/** Contains the publication's beta features. */
export type PublicationFeatures = {
  __typename?: 'PublicationFeatures'
  /** Audio player for blog posts. */
  audioBlog: AudioBlogFeature
  /** Individual styling for the publication. */
  customCSS: CustomCssFeature
  /** Newsletter feature for the publication which adds a `/newsletter` route for collecting subscribers and allows sending out newsletters. */
  newsletter: NewsletterFeature
  /** Show the read time for blog posts. */
  readTime: ReadTimeFeature
  /** Widget that shows up if a text on a blog post is selected. Allows for easy sharing or copying of the selected text. */
  textSelectionSharer: TextSelectionSharerFeature
  /** Show the view count for blog posts. */
  viewCount: ViewCountFeature
}

/**
 * Contains the publication's integrations.
 * Used to connect the publication with third party services like Google Analytics, Facebook Pixel, etc.
 */
export type PublicationIntegrations = {
  __typename?: 'PublicationIntegrations'
  /** Custom domain for integration with Fathom Analytics. */
  fathomCustomDomain?: Maybe<Scalars['String']['output']>
  /** A flag indicating if the custom domain is enabled for integration with Fathom Analytics. */
  fathomCustomDomainEnabled?: Maybe<Scalars['Boolean']['output']>
  /** Fathom Analytics Site ID for integration with Fathom Analytics. */
  fathomSiteID?: Maybe<Scalars['String']['output']>
  /** FB Pixel ID for integration with Facebook Pixel. */
  fbPixelID?: Maybe<Scalars['String']['output']>
  /** Google Tag Manager ID for integration with Google Tag Manager. */
  gTagManagerID?: Maybe<Scalars['String']['output']>
  /** Google Analytics Tracking ID for integration with Google Analytics. */
  gaTrackingID?: Maybe<Scalars['String']['output']>
  /** Hotjar Site ID for integration with Hotjar. */
  hotjarSiteID?: Maybe<Scalars['String']['output']>
  /** Matomo Site ID for integration with Matomo Analytics. */
  matomoSiteID?: Maybe<Scalars['String']['output']>
  /** Matomo URL for integration with Matomo Analytics. */
  matomoURL?: Maybe<Scalars['String']['output']>
  /** A flag indicating if the custom domain is enabled for integration with Plausible Analytics. */
  plausibleAnalyticsEnabled?: Maybe<Scalars['Boolean']['output']>
  /** The ID for the Hashnode-provided Umami analytics instance. */
  umamiWebsiteUUID?: Maybe<Scalars['String']['output']>
  /** Web Monetization Payment Pointer for integration with Web Monetization. */
  wmPaymentPointer?: Maybe<Scalars['String']['output']>
}

/** Contains publication's layout choices. */
export enum PublicationLayout {
  /** Changes the layout of blog into grid 3 post cards per row. */
  Grid = 'grid',
  /**
   * Changes the layout of blog into magazine style.
   * This is the newest layout.
   */
  Magazine = 'magazine',
  /** Changes the layout of blog into stacked list of posts. */
  Stacked = 'stacked',
}

/** Contains the publication's social media links. */
export type PublicationLinks = {
  __typename?: 'PublicationLinks'
  /** Daily.dev URL of the publication. */
  dailydev?: Maybe<Scalars['String']['output']>
  /** GitHub URL of the publication. */
  github?: Maybe<Scalars['String']['output']>
  /** Hashnode profile of author of the publication. */
  hashnode?: Maybe<Scalars['String']['output']>
  /** Instagram URL of the publication. */
  instagram?: Maybe<Scalars['String']['output']>
  /** LinkedIn URL of the publication. */
  linkedin?: Maybe<Scalars['String']['output']>
  /** Mastodon URL of the publication. */
  mastodon?: Maybe<Scalars['String']['output']>
  /** Twitter URL of the publication. */
  twitter?: Maybe<Scalars['String']['output']>
  /** Website URL of the publication. */
  website?: Maybe<Scalars['String']['output']>
  /** YouTube URL of the publication. */
  youtube?: Maybe<Scalars['String']['output']>
}

/** Contains the publication's navbar items. */
export type PublicationNavbarItem = {
  __typename?: 'PublicationNavbarItem'
  /** The unique identifier of the navbar item. */
  id: Scalars['ID']['output']
  /** The label of the navbar item. */
  label?: Maybe<Scalars['String']['output']>
  /** The static page added to the navbar item. */
  page?: Maybe<StaticPage>
  /** The order of the navbar item. */
  priority?: Maybe<Scalars['Int']['output']>
  /** The series added to the navbar item. */
  series?: Maybe<Series>
  /** The type of the navbar item, can be series, link or page. */
  type: PublicationNavigationType
  /** The URL of the navbar item. */
  url?: Maybe<Scalars['String']['output']>
}

/** The type of the navbar item, can be series, link or page. */
export enum PublicationNavigationType {
  /** The navbar item is a link. */
  Link = 'link',
  /** The navbar item is a static page. */
  Page = 'page',
  /** The navbar item is a series. */
  Series = 'series',
}

/**
 * Connection for posts within a publication. Contains a list of edges containing nodes.
 * Each node is a post.
 * Page info contains information about pagination like hasNextPage and endCursor.
 */
export type PublicationPostConnection = Connection & {
  __typename?: 'PublicationPostConnection'
  /** A list of edges containing Post information */
  edges: Array<PostEdge>
  /** Information for pagination in Post connection. */
  pageInfo: PageInfo
  /** The total number of documents in the connection. */
  totalDocuments: Scalars['Int']['output']
}

/**
 * Connection to get list of posts in publications.
 * Returns a list of edges which contains the posts in publication and cursor to the last item of the previous page.
 */
export type PublicationPostConnectionFilter = {
  /** Remove pinned post from the result set. */
  excludePinnedPost?: InputMaybe<Scalars['Boolean']['input']>
  /**
   * Filtering by tag slugs and tag IDs will return posts that match either of the filters.
   *
   * It is an "OR" filter and not an "AND" filter.
   */
  tagSlugs?: InputMaybe<Array<Scalars['String']['input']>>
  /**
   * Filtering by tag slugs and tag IDs will return posts that match either of the filters.
   *
   * It is an "OR" filter and not an "AND" filter.
   */
  tags?: InputMaybe<Array<Scalars['ObjectId']['input']>>
}

/**
 * Contains the publication's Sponsorship information.
 * User can sponsor their favorite publications and pay them directly using Stripe.
 */
export type PublicationSponsorship = {
  __typename?: 'PublicationSponsorship'
  /**
   * The content shared by author of the publication to their sponsors.
   * This is used as note to inform that author is open for sponsorship.
   */
  content?: Maybe<Content>
  /** The Stripe configuration of the publication's Sponsorship. */
  stripe?: Maybe<StripeConfiguration>
}

export type PublicationUserRecommendingPublicationConnection =
  PageConnection & {
    __typename?: 'PublicationUserRecommendingPublicationConnection'
    /** A list of edges containing Post information */
    edges: Array<UserRecommendingPublicationEdge>
    /** Publications recommending this publication. */
    nodes: Array<Publication>
    /** Information for page based pagination in Post connection. */
    pageInfo: OffsetPageInfo
    /** The total number of documents in the connection. */
    totalDocuments: Scalars['Int']['output']
  }

/** Contains information about the post to be published. */
export type PublishPostInput = {
  /** Ids of the co-authors of the post. */
  coAuthors?: InputMaybe<Array<Scalars['ObjectId']['input']>>
  /** Content of the post in markdown format. */
  contentMarkdown: Scalars['String']['input']
  /** Options for the cover image of the post. */
  coverImageOptions?: InputMaybe<CoverImageOptionsInput>
  /** A flag to indicate if the comments are disabled for the post. */
  disableComments?: InputMaybe<Scalars['Boolean']['input']>
  /** Information about the meta tags added to the post, used for SEO purpose. */
  metaTags?: InputMaybe<MetaTagsInput>
  /** The URL of the original article if the post is imported from an external source. */
  originalArticleURL?: InputMaybe<Scalars['String']['input']>
  /** The ID of publication the post belongs to. */
  publicationId: Scalars['ObjectId']['input']
  /**
   * Publish the post on behalf of another user who is a member of the publication.
   *
   * Only applicable for team publications.
   */
  publishAs?: InputMaybe<Scalars['ObjectId']['input']>
  /** Date when the post is published. */
  publishedAt?: InputMaybe<Scalars['DateTime']['input']>
  /** Providing a seriesId will add the post to that series. */
  seriesId?: InputMaybe<Scalars['ObjectId']['input']>
  /** Settings for the post like table of contents and newsletter activation. */
  settings?: InputMaybe<PublishPostSettingsInput>
  /** Slug of the post. */
  slug?: InputMaybe<Scalars['String']['input']>
  /** The subtitle of the post. */
  subtitle?: InputMaybe<Scalars['String']['input']>
  /** A list of tags added to the post. */
  tags: Array<PublishPostTagInput>
  /** The title of the post. */
  title: Scalars['String']['input']
}

export type PublishPostPayload = {
  __typename?: 'PublishPostPayload'
  post?: Maybe<Post>
}

export type PublishPostSettingsInput = {
  /** A flag to indicate if the post is delisted, used to hide the post from public feed. */
  delisted?: InputMaybe<Scalars['Boolean']['input']>
  /** A flag to indicate if the post contains table of content */
  enableTableOfContent?: InputMaybe<Scalars['Boolean']['input']>
  /** Wether to send a newsletter for this post. */
  isNewsletterActivated?: InputMaybe<Scalars['Boolean']['input']>
  /** A flag to indicate if the post is scheduled. */
  scheduled?: InputMaybe<Scalars['Boolean']['input']>
  /** Flag to indicate if the slug is overridden by the user. */
  slugOverridden?: InputMaybe<Scalars['Boolean']['input']>
}

export type PublishPostTagInput = {
  /**
   * A tag id that is referencing an existing tag.
   *
   * Either this or name and slug should be provided. If both are provided, the id will be used.
   */
  id?: InputMaybe<Scalars['ObjectId']['input']>
  /**
   * A name of a new tag to create.
   *
   * Either this and slug or id should be provided. If both are provided, the id will be used.
   */
  name?: InputMaybe<Scalars['String']['input']>
  /**
   * A slug of a new tag to create.
   *
   * Either this and name or id should be provided. If both are provided, the id will be used.
   */
  slug?: InputMaybe<Scalars['String']['input']>
}

export type Query = {
  __typename?: 'Query'
  /**
   * Returns a draft by ID.
   * Draft is a post that is not published yet.
   */
  draft?: Maybe<Draft>
  /**
   * Returns a paginated list of posts based on the provided filter.
   * Used in Hashnode home feed.
   */
  feed: FeedPostConnection
  /** Returns the current authenticated user. Only available to the authenticated user. */
  me: MyUser
  /**
   * Returns the publication with the given ID or host.
   * User can pass anyone of them.
   */
  publication?: Maybe<Publication>
  /** Get a scheduled post by ID. */
  scheduledPost?: Maybe<ScheduledPost>
  /** Returns a paginated list of posts based on search query for a particular publication id. */
  searchPostsOfPublication: SearchPostConnection
  /** Returns tag details by its slug. */
  tag?: Maybe<Tag>
  /** Returns users who have most actively participated in discussions by commenting in the last 7 days. */
  topCommenters: CommenterUserConnection
  /** Returns the user with the username. */
  user?: Maybe<User>
}

export type QueryDraftArgs = {
  id: Scalars['ObjectId']['input']
}

export type QueryFeedArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  filter?: InputMaybe<FeedFilter>
  first: Scalars['Int']['input']
}

export type QueryPublicationArgs = {
  host?: InputMaybe<Scalars['String']['input']>
  id?: InputMaybe<Scalars['ObjectId']['input']>
}

export type QueryScheduledPostArgs = {
  id?: InputMaybe<Scalars['ObjectId']['input']>
}

export type QuerySearchPostsOfPublicationArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  filter: SearchPostsOfPublicationFilter
  first: Scalars['Int']['input']
}

export type QueryTagArgs = {
  slug: Scalars['String']['input']
}

export type QueryTopCommentersArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  first: Scalars['Int']['input']
}

export type QueryUserArgs = {
  username: Scalars['String']['input']
}

export type RssImport = Node & {
  __typename?: 'RSSImport'
  id: Scalars['ID']['output']
  /** The URL pointing to the RSS feed. */
  rssURL: Scalars['String']['output']
}

/**
 * Contains the flag indicating if the read time feature is enabled or not.
 * User can enable or disable the read time feature from the publication settings.
 * Shows read time on blogs if enabled.
 */
export type ReadTimeFeature = Feature & {
  __typename?: 'ReadTimeFeature'
  /** A flag indicating if the read time feature is enabled or not. */
  isEnabled: Scalars['Boolean']['output']
}

export type RecommendPublicationsInput = {
  recommendedPublicationIds: Array<Scalars['ID']['input']>
  recommendingPublicationId: Scalars['ID']['input']
}

export type RecommendPublicationsPayload = {
  __typename?: 'RecommendPublicationsPayload'
  recommendedPublications?: Maybe<Array<UserRecommendedPublicationEdge>>
}

/** Contains a publication and a cursor for pagination. */
export type RecommendedPublicationEdge = Edge & {
  __typename?: 'RecommendedPublicationEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The node holding the Publication information */
  node: Publication
}

export type RedirectionRule = {
  __typename?: 'RedirectionRule'
  /** The destination URL of the redirection rule. */
  destination: Scalars['String']['output']
  /** The source URL of the redirection rule. */
  source: Scalars['String']['output']
  /** The type of the redirection rule. */
  type: HttpRedirectionType
}

export type RemoveCommentInput = {
  id: Scalars['ID']['input']
}

export type RemoveCommentPayload = {
  __typename?: 'RemoveCommentPayload'
  comment?: Maybe<Comment>
}

export type RemovePostInput = {
  /** The ID of the post to remove. */
  id: Scalars['ID']['input']
}

export type RemovePostPayload = {
  __typename?: 'RemovePostPayload'
  /** The deleted post. */
  post?: Maybe<Post>
}

export type RemoveRecommendationInput = {
  recommendedPublicationId: Scalars['ID']['input']
  recommendingPublicationId: Scalars['ID']['input']
}

export type RemoveRecommendationPayload = {
  __typename?: 'RemoveRecommendationPayload'
  recommendedPublication: Publication
}

export type RemoveReplyInput = {
  commentId: Scalars['ID']['input']
  replyId: Scalars['ID']['input']
}

export type RemoveReplyPayload = {
  __typename?: 'RemoveReplyPayload'
  reply?: Maybe<Reply>
}

/**
 * Contains basic information about the reply.
 * A reply is a response to a comment.
 */
export type Reply = Node & {
  __typename?: 'Reply'
  /** The author of the reply. */
  author: User
  /** The content of the reply in markdown and html format. */
  content: Content
  /** The date the reply was created. */
  dateAdded: Scalars['DateTime']['output']
  /** The ID of the reply. */
  id: Scalars['ID']['output']
  /** Total number of reactions on the reply by the authenticated user. User must be authenticated to use this field. */
  myTotalReactions: Scalars['Int']['output']
  /**
   * A unique string identifying the reply. Used as element id in the DOM on hashnode blogs.
   * It can be used to scroll to the reply in browser.
   */
  stamp?: Maybe<Scalars['String']['output']>
  /** Total number of reactions on the reply. Reactions are hearts added to any reply. */
  totalReactions: Scalars['Int']['output']
}

export type ReschedulePostInput = {
  /** The Draft ID of the scheduled post. */
  draftId: Scalars['ObjectId']['input']
  /** New scheduled date for the post to be rescheduled. */
  scheduledDate: Scalars['DateTime']['input']
}

export type ResendWebhookRequestInput = {
  webhookId: Scalars['ID']['input']
  webhookMessageId: Scalars['ID']['input']
}

export type ResendWebhookRequestPayload = {
  __typename?: 'ResendWebhookRequestPayload'
  webhookMessage?: Maybe<WebhookMessage>
}

/** Information to help in seo related meta tags. */
export type Seo = {
  __typename?: 'SEO'
  /** The description used in og:description tag for SEO purposes. */
  description?: Maybe<Scalars['String']['output']>
  /** The title used in og:title tag for SEO purposes. */
  title?: Maybe<Scalars['String']['output']>
}

/**
 * Contains basic information about the scheduled post.
 * A scheduled post is a post that is scheduled to be published in the future.
 */
export type ScheduledPost = Node & {
  __typename?: 'ScheduledPost'
  /** The date the scheduled post was created. */
  author: User
  /** Returns the draft associated with the scheduled post. */
  draft?: Maybe<Draft>
  /** The ID of the scheduled post. */
  id: Scalars['ID']['output']
  /** Returns the publication the post is scheduled for. */
  publication: Publication
  /** Returns user who scheduled the post. This is usually the author of the post. */
  scheduledBy?: Maybe<User>
  /** The scheduled date for the post to be published. This is the date the post will be published. */
  scheduledDate: Scalars['DateTime']['output']
}

export type ScheduledPostPayload = {
  __typename?: 'ScheduledPostPayload'
  /** Payload returned in response of reschedulePost mutation. */
  payload: ScheduledPost
}

/** Enum of all the scopes that can be used with the @requireAuth directive. */
export enum Scope {
  AcknowledgeEmailImport = 'acknowledge_email_import',
  ActiveProUser = 'active_pro_user',
  AssignProPublications = 'assign_pro_publications',
  ChangeProSubscription = 'change_pro_subscription',
  CreatePro = 'create_pro',
  ImportSubscribersToPublication = 'import_subscribers_to_publication',
  PublicationAdmin = 'publication_admin',
  PublishComment = 'publish_comment',
  PublishDraft = 'publish_draft',
  PublishPost = 'publish_post',
  PublishReply = 'publish_reply',
  RecommendPublications = 'recommend_publications',
  RemoveComment = 'remove_comment',
  RemoveReply = 'remove_reply',
  Signup = 'signup',
  TeamHashnode = 'team_hashnode',
  UpdateComment = 'update_comment',
  UpdatePost = 'update_post',
  UpdateReply = 'update_reply',
  WebhookAdmin = 'webhook_admin',
  WritePost = 'write_post',
  WriteSeries = 'write_series',
}

/**
 * Connection for posts within a publication search. Contains a list of edges containing nodes.
 * Each node is a post.
 * Page info contains information about pagination like hasNextPage and endCursor.
 */
export type SearchPostConnection = Connection & {
  __typename?: 'SearchPostConnection'
  /** A list of edges containing Post information */
  edges: Array<PostEdge>
  /** Information for pagination in Post connection. */
  pageInfo: PageInfo
}

export type SearchPostsOfPublicationFilter = {
  /** The ID of publications to search from. */
  publicationId: Scalars['ObjectId']['input']
  /** The query to be searched in post. */
  query: Scalars['String']['input']
}

/**
 * Contains basic information about the series.
 * A series is a collection of posts that are related to each other.
 */
export type Series = Node & {
  __typename?: 'Series'
  /** Returns the user who is author of the series. */
  author: User
  /** The cover image of the series. */
  coverImage?: Maybe<Scalars['String']['output']>
  /** The date and time the series was created. */
  createdAt: Scalars['DateTime']['output']
  /** Unique identifier for the series. */
  cuid?: Maybe<Scalars['ID']['output']>
  /** The description of the series. Contains markdown and html version of the series's description. */
  description?: Maybe<Content>
  /** The ID of the series. */
  id: Scalars['ID']['output']
  /** The name of the series. Shown in series page. */
  name: Scalars['String']['output']
  /** Returns a list of posts in the series. */
  posts: SeriesPostConnection
  /** The slug of the series. Used to access series page.  Example https://johndoe.com/series/series-slug */
  slug: Scalars['String']['output']
  /** The sort order of the series, determines if the latest posts should appear first or last in series. */
  sortOrder: SortOrder
}

/**
 * Contains basic information about the series.
 * A series is a collection of posts that are related to each other.
 */
export type SeriesPostsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  first: Scalars['Int']['input']
}

/**
 * Connection for Series. Contains a list of edges containing nodes.
 * Each node is a Series.
 * Page info contains information about pagination like hasNextPage and endCursor.
 */
export type SeriesConnection = Connection & {
  __typename?: 'SeriesConnection'
  /** A list of edges containing Series information */
  edges: Array<SeriesEdge>
  /** Information for pagination in SeriesList connection. */
  pageInfo: PageInfo
  /** The total number of documents in the connection. */
  totalDocuments: Scalars['Int']['output']
}

/** Contains a Series and a cursor for pagination. */
export type SeriesEdge = Edge & {
  __typename?: 'SeriesEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The node holding the Series information */
  node: Series
}

/**
 * Connection for posts within a series. Contains a list of edges containing nodes.
 * Each node is a post.
 * Page info contains information about pagination like hasNextPage and endCursor.
 */
export type SeriesPostConnection = Connection & {
  __typename?: 'SeriesPostConnection'
  /** A list of edges containing Post information */
  edges: Array<PostEdge>
  /** Information for pagination in Post connection. */
  pageInfo: PageInfo
  /** The total number of documents in the connection. */
  totalDocuments: Scalars['Int']['output']
}

/** Available social media links. */
export type SocialMediaLinks = {
  __typename?: 'SocialMediaLinks'
  /** The user's Facebook profile. */
  facebook?: Maybe<Scalars['String']['output']>
  /** The user's GitHub profile. */
  github?: Maybe<Scalars['String']['output']>
  /** The user's Instagram profile. */
  instagram?: Maybe<Scalars['String']['output']>
  /** The user's LinkedIn profile. */
  linkedin?: Maybe<Scalars['String']['output']>
  /** The user's StackOverflow profile. */
  stackoverflow?: Maybe<Scalars['String']['output']>
  /** The user's Twitter profile. */
  twitter?: Maybe<Scalars['String']['output']>
  /** The user's website. */
  website?: Maybe<Scalars['String']['output']>
  /** The user's YouTube profile. */
  youtube?: Maybe<Scalars['String']['output']>
}

/** SortOrder is a common enum for all types that can be sorted. */
export enum SortOrder {
  Asc = 'asc',
  Dsc = 'dsc',
}

/**
 * Contains basic information about the static page.
 * Static pages are pages that are written in markdown and can be added to blog.
 */
export type StaticPage = Node & {
  __typename?: 'StaticPage'
  /** Content of the static page. Contains markdown and html version of the static page's content. */
  content: Content
  /** A flag to determine if the static page is hidden from public or not, this is used to hide the page instead of deleting it. */
  hidden: Scalars['Boolean']['output']
  /** The ID of the static page. */
  id: Scalars['ID']['output']
  /** Information about the static page's Open Graph metadata i.e. image. */
  ogMetaData?: Maybe<OpenGraphMetaData>
  /** Information about the static page's SEO metadata i.e. title and description. */
  seo?: Maybe<Seo>
  /** The slug of the static page. Used to access static page.  Example https://johndoe.com/my-page */
  slug: Scalars['String']['output']
  /** The title of the static page. Shown in nav bar. */
  title: Scalars['String']['output']
}

/**
 * Connection to get list of static pages.
 * Returns a list of edges which contains the static page and cursor to the last item of the previous page.
 */
export type StaticPageConnection = Connection & {
  __typename?: 'StaticPageConnection'
  /** A list of edges containing nodes in the connection. */
  edges: Array<StaticPageEdge>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
  /** The total number of documents in the connection. */
  totalDocuments: Scalars['Int']['output']
}

/** An edge that contains a node of type static page and cursor to the node. */
export type StaticPageEdge = Edge & {
  __typename?: 'StaticPageEdge'
  /** A cursor to the last item of the previous page. */
  cursor: Scalars['String']['output']
  /** The node containing a static page. */
  node: StaticPage
}

/** Contains the publication's Stripe configuration. */
export type StripeConfiguration = {
  __typename?: 'StripeConfiguration'
  /** The Stripe account ID of the publication. */
  accountId?: Maybe<Scalars['String']['output']>
  /** A flag indicating if the publication is connected to Stripe. */
  connected: Scalars['Boolean']['output']
  /** The country of origin of the publication. */
  country?: Maybe<Scalars['String']['output']>
}

export type SubscribeToNewsletterInput = {
  /** The email of the subscriber. */
  email: Scalars['String']['input']
  /** The ID of the publication to subscribe to. */
  publicationId: Scalars['ObjectId']['input']
}

export type SubscribeToNewsletterPayload = {
  __typename?: 'SubscribeToNewsletterPayload'
  status?: Maybe<NewsletterSubscribeStatus>
}

export type TableOfContentsFeature = Feature & {
  __typename?: 'TableOfContentsFeature'
  /** Wether or not ser has chosen to show a table of contents on the post. */
  isEnabled: Scalars['Boolean']['output']
  /** The content of the table of contents. */
  items: Array<TableOfContentsItem>
}

export type TableOfContentsItem = Node & {
  __typename?: 'TableOfContentsItem'
  /** Unique identifier. */
  id: Scalars['ID']['output']
  /** The level of nesting. Refers to the heading level in the post. */
  level: Scalars['Int']['output']
  /** ID of the `TableOfContentsItem` that is one level higher in the hierarchy. `null` if this is a top level item. */
  parentId?: Maybe<Scalars['ID']['output']>
  /** The slug of the referenced headline. */
  slug: Scalars['String']['output']
  /** The title of the referenced headline. */
  title: Scalars['String']['output']
}

export type Tag = ITag &
  Node & {
    __typename?: 'Tag'
    /** Total number of users following this tag. */
    followersCount: Scalars['Int']['output']
    /** The ID of the tag. */
    id: Scalars['ID']['output']
    /** Information about the tag. Contains markdown html and text version of the tag's info. */
    info?: Maybe<Content>
    /** The logo of the tag. Shown in tag page. */
    logo?: Maybe<Scalars['String']['output']>
    /** The name of the tag. Shown in tag page. */
    name: Scalars['String']['output']
    /** Paginated list of posts published under this tag */
    posts: FeedPostConnection
    /** Alltime usage count of this tag in posts. */
    postsCount: Scalars['Int']['output']
    /** The slug of the tag. Used to access tags feed.  Example https://hashnode.com/n/graphql */
    slug: Scalars['String']['output']
    /** The tagline of the tag. */
    tagline?: Maybe<Scalars['String']['output']>
  }

export type TagPostsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  filter: TagPostConnectionFilter
  first: Scalars['Int']['input']
}

/** Contains a tag and a cursor for pagination. */
export type TagEdge = Edge & {
  __typename?: 'TagEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The node holding the Tag information */
  node: Tag
}

export type TagPostConnectionFilter = {
  /** Sort tag feed by recents, popular, or trending. Defaults to recents. */
  sortBy?: InputMaybe<TagPostsSort>
}

/** The field by which to sort the tag feed. */
export enum TagPostsSort {
  /** Sorts by popularity, used in Hot tag feed. */
  Popular = 'popular',
  /** Determinate how to sort the results. Defaults to recents, used in New tag feed. */
  Recent = 'recent',
  /** Trending is particular used to fetch top posts trending within a week time under a tag */
  Trending = 'trending',
}

/**
 * Contains the flag indicating if the text selection sharer feature is enabled or not.
 * User can enable or disable the text selection sharer feature from the publication settings.
 * Shows a widget if a text on a blog post is selected. Allows for easy sharing or copying of the selected text.
 */
export type TextSelectionSharerFeature = Feature & {
  __typename?: 'TextSelectionSharerFeature'
  /** A flag indicating if the text selection sharer feature is enabled or not. */
  isEnabled: Scalars['Boolean']['output']
}

/** Payload for the toggleFollowingUser mutation. */
export type ToggleFollowUserPayload = {
  __typename?: 'ToggleFollowUserPayload'
  /** The user that was followed/unfollowed. */
  user?: Maybe<User>
}

export type TriggerWebhookTestInput = {
  webhookId: Scalars['ID']['input']
}

export type TriggerWebhookTestPayload = {
  __typename?: 'TriggerWebhookTestPayload'
  webhook?: Maybe<Webhook>
}

export type UnsubscribeFromNewsletterInput = {
  /** The email that is currently subscribed. */
  email: Scalars['String']['input']
  /** The ID of the publication to unsubscribe from. */
  publicationId: Scalars['ObjectId']['input']
}

export type UnsubscribeFromNewsletterPayload = {
  __typename?: 'UnsubscribeFromNewsletterPayload'
  status?: Maybe<NewsletterUnsubscribeStatus>
}

export type UpdateCommentInput = {
  contentMarkdown: Scalars['String']['input']
  id: Scalars['ID']['input']
}

export type UpdateCommentPayload = {
  __typename?: 'UpdateCommentPayload'
  comment?: Maybe<Comment>
}

export type UpdatePostInput = {
  /**
   * Update co-authors of the post.
   * Must be a member of the publication.
   */
  coAuthors?: InputMaybe<Array<Scalars['ObjectId']['input']>>
  /** The publication the post is published to. */
  contentMarkdown?: InputMaybe<Scalars['String']['input']>
  /** Options for the cover image of the post. */
  coverImageOptions?: InputMaybe<CoverImageOptionsInput>
  /** The id of the post to update. */
  id: Scalars['ID']['input']
  /** Information about the meta tags added to the post, used for SEO purpose. */
  metaTags?: InputMaybe<MetaTagsInput>
  /** Canonical URL of the original article. */
  originalArticleURL?: InputMaybe<Scalars['String']['input']>
  /** If the publication should be changed this is the new Publication ID */
  publicationId?: InputMaybe<Scalars['ObjectId']['input']>
  /**
   * Set a different author for the post than the requesting user.
   * Must be a member of the publication.
   */
  publishAs?: InputMaybe<Scalars['ObjectId']['input']>
  /** Backdated publish date. */
  publishedAt?: InputMaybe<Scalars['DateTime']['input']>
  /**
   * Providing a seriesId will add the post to that series.
   * Must be a series of the publication.
   */
  seriesId?: InputMaybe<Scalars['ObjectId']['input']>
  /** Whether or not to enable the table of content. */
  settings?: InputMaybe<UpdatePostSettingsInput>
  /** Slug of the post. Only if you want to override the slug that will be generated based on the title. */
  slug?: InputMaybe<Scalars['String']['input']>
  /** The subtitle of the post */
  subtitle?: InputMaybe<Scalars['String']['input']>
  /** Tags to add to the post. New tags will be created if they don't exist. It overrides the existing tags. */
  tags?: InputMaybe<Array<PublishPostTagInput>>
  /** The new title of the post */
  title?: InputMaybe<Scalars['String']['input']>
}

export type UpdatePostPayload = {
  __typename?: 'UpdatePostPayload'
  post?: Maybe<Post>
}

export type UpdatePostSettingsInput = {
  /** A flag to indicate if the post is delisted, used to hide the post from public feed. */
  delisted?: InputMaybe<Scalars['Boolean']['input']>
  /** Whether or not comments should be disabled. */
  disableComments?: InputMaybe<Scalars['Boolean']['input']>
  /** A flag to indicate if the post contains table of content */
  isTableOfContentEnabled?: InputMaybe<Scalars['Boolean']['input']>
  /** Pin the post to the blog homepage. */
  pinToBlog?: InputMaybe<Scalars['Boolean']['input']>
}

export type UpdateReplyInput = {
  commentId: Scalars['ID']['input']
  contentMarkdown: Scalars['String']['input']
  replyId: Scalars['ID']['input']
}

export type UpdateReplyPayload = {
  __typename?: 'UpdateReplyPayload'
  reply?: Maybe<Reply>
}

export type UpdateWebhookInput = {
  events?: InputMaybe<Array<WebhookEvent>>
  id: Scalars['ID']['input']
  secret?: InputMaybe<Scalars['String']['input']>
  url?: InputMaybe<Scalars['String']['input']>
}

export type UpdateWebhookPayload = {
  __typename?: 'UpdateWebhookPayload'
  webhook?: Maybe<Webhook>
}

export enum UrlPattern {
  /** Post URLs contain the slug (for example `my slug`) and a random id (like `1234`) , e.g. "/my-slug-1234". */
  Default = 'DEFAULT',
  /** Post URLs only contain the slug, e.g. "/my-slug". */
  Simple = 'SIMPLE',
}

/** Basic information about a user on Hashnode. */
export type User = IUser &
  Node & {
    __typename?: 'User'
    /**
     * Whether or not the user is an ambassador.
     * @deprecated Ambassadors program no longer active. Will be removed after 02/01/2024
     */
    ambassador: Scalars['Boolean']['output']
    /** The availability of the user based on tech stack and interests. Shown on the "I am available for" section in user's profile. */
    availableFor?: Maybe<Scalars['String']['output']>
    /** Returns a list of badges that the user has earned. Shown on blogs /badges page. Example - https://iamshadmirza.com/badges */
    badges: Array<Badge>
    /** The bio of the user. Visible in about me section of the user's profile. */
    bio?: Maybe<Content>
    /**
     * The bio of the user. Visible in about me section of the user's profile.
     * @deprecated Will be removed on 26/10/2023. Use bio instead of bioV2
     */
    bioV2?: Maybe<Content>
    /** The date the user joined Hashnode. */
    dateJoined?: Maybe<Scalars['DateTime']['output']>
    /** Whether or not the user is deactivated. */
    deactivated: Scalars['Boolean']['output']
    /** The users who are following this user */
    followers: UserConnection
    /** The number of users that follow the requested user. Visible in the user's profile. */
    followersCount: Scalars['Int']['output']
    /**
     * Wether or not the authenticated user follows this user.
     * Returns false if the authenticated user this user.
     */
    following: Scalars['Boolean']['output']
    /** The number of users that this user is following. Visible in the user's profile. */
    followingsCount: Scalars['Int']['output']
    /** The users which this user is following */
    follows: UserConnection
    /**
     * Wether or not this user follows the authenticated user.
     * Returns false if the authenticated user this user.
     */
    followsBack: Scalars['Boolean']['output']
    /** The ID of the user. It can be used to identify the user. */
    id: Scalars['ID']['output']
    /** Wether or not this is a pro user. */
    isPro: Scalars['Boolean']['output']
    /** The location of the user. */
    location?: Maybe<Scalars['String']['output']>
    /** The name of the user. */
    name: Scalars['String']['output']
    /** Returns the list of posts the user has published. */
    posts: UserPostConnection
    /** The URL to the profile picture of the user. */
    profilePicture?: Maybe<Scalars['String']['output']>
    /** Publications associated with the user. Includes personal and team publications. */
    publications: UserPublicationsConnection
    /** The social media links of the user. Shown on the user's profile. */
    socialMediaLinks?: Maybe<SocialMediaLinks>
    /** The tagline of the user. Shown on the user's profile below the name. */
    tagline?: Maybe<Scalars['String']['output']>
    /** Returns a list of tags that the user follows. */
    tagsFollowing: Array<Tag>
    /** The username of the user. It is unique and tied with user's profile URL. Example - https://hashnode.com/@username */
    username: Scalars['String']['output']
  }

/** Basic information about a user on Hashnode. */
export type UserFollowersArgs = {
  page: Scalars['Int']['input']
  pageSize: Scalars['Int']['input']
}

/** Basic information about a user on Hashnode. */
export type UserFollowsArgs = {
  page: Scalars['Int']['input']
  pageSize: Scalars['Int']['input']
}

/** Basic information about a user on Hashnode. */
export type UserPostsArgs = {
  filter?: InputMaybe<UserPostConnectionFilter>
  page: Scalars['Int']['input']
  pageSize: Scalars['Int']['input']
  sortBy?: InputMaybe<UserPostsSort>
}

/** Basic information about a user on Hashnode. */
export type UserPublicationsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  filter?: InputMaybe<UserPublicationsConnectionFilter>
  first: Scalars['Int']['input']
}

/**
 * Connection for users to another user. Contains a list of nodes.
 * Each node is a user.
 * Page info contains information about pagination like hasNextPage and endCursor.
 */
export type UserConnection = PageConnection & {
  __typename?: 'UserConnection'
  /** A list of users */
  nodes: Array<User>
  /** Information for page based pagination in users connection. */
  pageInfo: OffsetPageInfo
  /** The total number of documents in the connection. */
  totalDocuments: Scalars['Int']['output']
}

/** Contains a node of type user and cursor for pagination. */
export type UserEdge = Edge & {
  __typename?: 'UserEdge'
  /** The cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The node containing User information */
  node: User
}

/**
 * Connection for posts written by a single user. Contains a list of edges containing nodes.
 * Each node is a post.
 * Page info contains information about pagination like hasNextPage and endCursor.
 */
export type UserPostConnection = PageConnection & {
  __typename?: 'UserPostConnection'
  /** A list of edges containing Post information */
  edges: Array<UserPostEdge>
  /** A list of posts */
  nodes: Array<Post>
  /** Information for page based pagination in Post connection. */
  pageInfo: OffsetPageInfo
  /** The total number of documents in the connection. */
  totalDocuments: Scalars['Int']['output']
}

/** Filter for the posts of a user. */
export type UserPostConnectionFilter = {
  /** Filtering by author status. Either all posts the user has authored or co-authored are returned or the authored posts only. */
  authorType?: InputMaybe<UserPostsAuthorTypeFilter>
  /** Filtering by publication IDs will return posts from the author within the publication. */
  publications?: InputMaybe<Array<Scalars['ID']['input']>>
  /**
   * Only include posts that reference the provided tag slugs.
   *
   * Filtering by `tags` and `tagSlugs` will filter posts that match either of those two filters.
   */
  tagSlugs?: InputMaybe<Array<Scalars['String']['input']>>
  /**
   * Only include posts that reference the provided tag IDs.
   *
   *
   * Filtering by `tags` and `tagSlugs` will filter posts that match either of those two filters.
   */
  tags?: InputMaybe<Array<Scalars['ID']['input']>>
}

/** Contains a post and the author status. */
export type UserPostEdge = {
  __typename?: 'UserPostEdge'
  /** Indicates weather the user is the author or co-author of the post. */
  authorType: PostAuthorType
  /** The node holding the Post information. */
  node: Post
}

/** Filter for the posts of a user. */
export enum UserPostsAuthorTypeFilter {
  /** Only posts that are authored by the user. */
  AuthorOnly = 'AUTHOR_ONLY',
  /** Only posts that are co-authored by the user. */
  CoAuthorOnly = 'CO_AUTHOR_ONLY',
}

/** Sorting for the posts of a user. */
export enum UserPostsSort {
  /** Oldest posts first. */
  DatePublishedAsc = 'DATE_PUBLISHED_ASC',
  /** Newest posts first. */
  DatePublishedDesc = 'DATE_PUBLISHED_DESC',
}

/** The role of the user in the publication. */
export enum UserPublicationRole {
  /** Contributors can join the publication and contribute an article. They cannot directly publish a new article. */
  Contributor = 'CONTRIBUTOR',
  /**
   * The editor has access to the publication dashboard to customize the blog and approve/reject posts.
   * They also have access to the member panel to add/modify/remove members. Editors cannot remove other editors or update their roles.
   */
  Editor = 'EDITOR',
  /** The owner is the creator of the publication and can do all things, including delete publication. */
  Owner = 'OWNER',
}

/**
 * Connection to get list of publications.
 * Returns a list of edges which contains the publications and cursor to the last item of the previous page.
 */
export type UserPublicationsConnection = Connection & {
  __typename?: 'UserPublicationsConnection'
  /** A list of edges of publications connection. */
  edges: Array<UserPublicationsEdge>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
  /** The total amount of publications taking into account the filter. */
  totalDocuments: Scalars['Int']['output']
}

/** Filter to apply to the publications. */
export type UserPublicationsConnectionFilter = {
  /** Only return pro publications. */
  isPro?: InputMaybe<Scalars['Boolean']['input']>
  /** Only include publication in which the user has one of the provided roles. */
  roles?: InputMaybe<Array<UserPublicationRole>>
}

/** An edge that contains a node of type publication and cursor to the node. */
export type UserPublicationsEdge = Edge & {
  __typename?: 'UserPublicationsEdge'
  /** The cursor to the node. */
  cursor: Scalars['String']['output']
  /** Node containing the publication. */
  node: Publication
  /** The role of the user in the publication. */
  role: UserPublicationRole
}

export type UserRecommendedPublicationEdge = {
  __typename?: 'UserRecommendedPublicationEdge'
  /** The publication that is recommended by the publication this connection originates from. */
  node: Publication
  /** The amount of followers the publication referenced in `node` has gained by recommendations from the publication. */
  totalFollowersGained: Scalars['Int']['output']
}

export type UserRecommendingPublicationEdge = {
  __typename?: 'UserRecommendingPublicationEdge'
  /** The publication that is recommending the publication this connection originates from. */
  node: Publication
  /** The amount of followers the publication has gained by recommendations from the publication referenced in `node`. */
  totalFollowersGained: Scalars['Int']['output']
}

/**
 * Contains the flag indicating if the view count feature is enabled or not.
 * User can enable or disable the view count feature from the publication settings.
 * Shows total views on blogs if enabled.
 */
export type ViewCountFeature = Feature & {
  __typename?: 'ViewCountFeature'
  /** A flag indicating if the view count feature is enabled or not. */
  isEnabled: Scalars['Boolean']['output']
}

export type Webhook = Node & {
  __typename?: 'Webhook'
  createdAt: Scalars['DateTime']['output']
  events: Array<WebhookEvent>
  /** The ID of the post. Used to uniquely identify the post. */
  id: Scalars['ID']['output']
  /**
   * Messages that has been sent via this webhook.
   * Messages include the request and eventual response.
   */
  messages: WebhookMessageConnection
  publication: Publication
  secret: Scalars['String']['output']
  updatedAt?: Maybe<Scalars['DateTime']['output']>
  url: Scalars['String']['output']
}

export type WebhookMessagesArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  first: Scalars['Int']['input']
}

export enum WebhookEvent {
  PostDeleted = 'POST_DELETED',
  PostPublished = 'POST_PUBLISHED',
  PostUpdated = 'POST_UPDATED',
  StaticPageDeleted = 'STATIC_PAGE_DELETED',
  StaticPageEdited = 'STATIC_PAGE_EDITED',
  StaticPagePublished = 'STATIC_PAGE_PUBLISHED',
}

export type WebhookMessage = Node & {
  __typename?: 'WebhookMessage'
  createdAt: Scalars['DateTime']['output']
  event: WebhookEvent
  id: Scalars['ID']['output']
  /** True if either the request failed or the response status code was not 2xx. */
  isError: Scalars['Boolean']['output']
  /** True if the message was resent. */
  isResent: Scalars['Boolean']['output']
  /** True if the message was sent as a test. */
  isTest: Scalars['Boolean']['output']
  request: WebhookMessageRequest
  response?: Maybe<WebhookMessageResponse>
  url: Scalars['String']['output']
}

export type WebhookMessageConnection = Connection & {
  __typename?: 'WebhookMessageConnection'
  edges: Array<WebhookMessageEdge>
  pageInfo: PageInfo
}

export type WebhookMessageEdge = Edge & {
  __typename?: 'WebhookMessageEdge'
  cursor: Scalars['String']['output']
  node: WebhookMessage
}

export type WebhookMessageRequest = {
  __typename?: 'WebhookMessageRequest'
  body: Scalars['String']['output']
  error?: Maybe<WebhookMessageRequestError>
  headers: Scalars['String']['output']
  /** Unique identifier of the request. Can be used to deduplicate requests. */
  uuid: Scalars['String']['output']
}

export type WebhookMessageRequestError = {
  __typename?: 'WebhookMessageRequestError'
  code: Scalars['String']['output']
  message: Scalars['String']['output']
}

export type WebhookMessageResponse = {
  __typename?: 'WebhookMessageResponse'
  body?: Maybe<Scalars['String']['output']>
  headers?: Maybe<Scalars['String']['output']>
  httpStatus: Scalars['Int']['output']
  /** The time it took from the moment the request has been send until the first byte of the response has been received. */
  timeToFirstByteMilliseconds?: Maybe<Scalars['Int']['output']>
}

export type PageInfoFragment = {
  __typename?: 'PageInfo'
  endCursor?: string | null
  hasNextPage?: boolean | null
}

export type PostFragment = {
  __typename?: 'Post'
  id: string
  title: string
  url: string
  publishedAt: string
  slug: string
  brief: string
  author: { __typename?: 'User'; name: string; profilePicture?: string | null }
  coverImage?: { __typename?: 'PostCoverImage'; url: string } | null
  comments: { __typename?: 'PostCommentConnection'; totalDocuments: number }
}

export type PublicationFragment = {
  __typename?: 'Publication'
  id: string
  title: string
  displayTitle?: string | null
  url: string
  metaTags?: string | null
  favicon?: string | null
  isTeam: boolean
  followersCount?: number | null
  descriptionSEO?: string | null
  author: {
    __typename?: 'User'
    name: string
    username: string
    profilePicture?: string | null
    followersCount: number
  }
  ogMetaData: { __typename?: 'OpenGraphMetaData'; image?: string | null }
  preferences: {
    __typename?: 'Preferences'
    logo?: string | null
    darkMode?: {
      __typename?: 'DarkModePreferences'
      logo?: string | null
    } | null
    navbarItems: Array<{
      __typename?: 'PublicationNavbarItem'
      id: string
      type: PublicationNavigationType
      label?: string | null
      url?: string | null
    }>
  }
  links?: {
    __typename?: 'PublicationLinks'
    twitter?: string | null
    github?: string | null
    linkedin?: string | null
    hashnode?: string | null
  } | null
  integrations?: {
    __typename?: 'PublicationIntegrations'
    umamiWebsiteUUID?: string | null
    gaTrackingID?: string | null
    fbPixelID?: string | null
    hotjarSiteID?: string | null
    matomoURL?: string | null
    matomoSiteID?: string | null
    fathomSiteID?: string | null
    fathomCustomDomain?: string | null
    fathomCustomDomainEnabled?: boolean | null
    plausibleAnalyticsEnabled?: boolean | null
  } | null
}

export type DraftByIdQueryVariables = Exact<{
  id: Scalars['ObjectId']['input']
}>

export type DraftByIdQuery = {
  __typename?: 'Query'
  draft?: {
    __typename?: 'Draft'
    id: string
    title?: string | null
    dateUpdated: string
    content?: { __typename?: 'Content'; markdown: string } | null
    author: { __typename?: 'User'; id: string; name: string; username: string }
    tags: Array<{ __typename?: 'Tag'; id: string; name: string; slug: string }>
  } | null
}

export type PageByPublicationQueryVariables = Exact<{
  slug: Scalars['String']['input']
  host: Scalars['String']['input']
}>

export type PageByPublicationQuery = {
  __typename?: 'Query'
  publication?: {
    __typename?: 'Publication'
    id: string
    title: string
    displayTitle?: string | null
    url: string
    metaTags?: string | null
    favicon?: string | null
    isTeam: boolean
    followersCount?: number | null
    descriptionSEO?: string | null
    staticPage?: {
      __typename?: 'StaticPage'
      id: string
      title: string
      slug: string
      content: { __typename?: 'Content'; markdown: string }
    } | null
    author: {
      __typename?: 'User'
      name: string
      username: string
      profilePicture?: string | null
      followersCount: number
    }
    ogMetaData: { __typename?: 'OpenGraphMetaData'; image?: string | null }
    preferences: {
      __typename?: 'Preferences'
      logo?: string | null
      darkMode?: {
        __typename?: 'DarkModePreferences'
        logo?: string | null
      } | null
      navbarItems: Array<{
        __typename?: 'PublicationNavbarItem'
        id: string
        type: PublicationNavigationType
        label?: string | null
        url?: string | null
      }>
    }
    links?: {
      __typename?: 'PublicationLinks'
      twitter?: string | null
      github?: string | null
      linkedin?: string | null
      hashnode?: string | null
    } | null
    integrations?: {
      __typename?: 'PublicationIntegrations'
      umamiWebsiteUUID?: string | null
      gaTrackingID?: string | null
      fbPixelID?: string | null
      hotjarSiteID?: string | null
      matomoURL?: string | null
      matomoSiteID?: string | null
      fathomSiteID?: string | null
      fathomCustomDomain?: string | null
      fathomCustomDomainEnabled?: boolean | null
      plausibleAnalyticsEnabled?: boolean | null
    } | null
  } | null
}

export type StaticPageFragment = {
  __typename?: 'StaticPage'
  id: string
  title: string
  slug: string
  content: { __typename?: 'Content'; markdown: string }
}

export type PostsByPublicationQueryVariables = Exact<{
  host: Scalars['String']['input']
  first: Scalars['Int']['input']
  after?: InputMaybe<Scalars['String']['input']>
}>

export type PostsByPublicationQuery = {
  __typename?: 'Query'
  publication?: {
    __typename?: 'Publication'
    id: string
    title: string
    displayTitle?: string | null
    url: string
    metaTags?: string | null
    favicon?: string | null
    isTeam: boolean
    followersCount?: number | null
    descriptionSEO?: string | null
    posts: {
      __typename?: 'PublicationPostConnection'
      totalDocuments: number
      edges: Array<{
        __typename?: 'PostEdge'
        node: {
          __typename?: 'Post'
          id: string
          title: string
          url: string
          publishedAt: string
          slug: string
          brief: string
          comments: {
            __typename?: 'PostCommentConnection'
            totalDocuments: number
          }
          author: {
            __typename?: 'User'
            name: string
            profilePicture?: string | null
          }
          coverImage?: { __typename?: 'PostCoverImage'; url: string } | null
        }
      }>
      pageInfo: {
        __typename?: 'PageInfo'
        endCursor?: string | null
        hasNextPage?: boolean | null
      }
    }
    author: {
      __typename?: 'User'
      name: string
      username: string
      profilePicture?: string | null
      followersCount: number
    }
    ogMetaData: { __typename?: 'OpenGraphMetaData'; image?: string | null }
    preferences: {
      __typename?: 'Preferences'
      logo?: string | null
      darkMode?: {
        __typename?: 'DarkModePreferences'
        logo?: string | null
      } | null
      navbarItems: Array<{
        __typename?: 'PublicationNavbarItem'
        id: string
        type: PublicationNavigationType
        label?: string | null
        url?: string | null
      }>
    }
    links?: {
      __typename?: 'PublicationLinks'
      twitter?: string | null
      github?: string | null
      linkedin?: string | null
      hashnode?: string | null
    } | null
    integrations?: {
      __typename?: 'PublicationIntegrations'
      umamiWebsiteUUID?: string | null
      gaTrackingID?: string | null
      fbPixelID?: string | null
      hotjarSiteID?: string | null
      matomoURL?: string | null
      matomoSiteID?: string | null
      fathomSiteID?: string | null
      fathomCustomDomain?: string | null
      fathomCustomDomainEnabled?: boolean | null
      plausibleAnalyticsEnabled?: boolean | null
    } | null
  } | null
}

export type MorePostsByPublicationQueryVariables = Exact<{
  host: Scalars['String']['input']
  first: Scalars['Int']['input']
  after?: InputMaybe<Scalars['String']['input']>
}>

export type MorePostsByPublicationQuery = {
  __typename?: 'Query'
  publication?: {
    __typename?: 'Publication'
    posts: {
      __typename?: 'PublicationPostConnection'
      edges: Array<{
        __typename?: 'PostEdge'
        node: {
          __typename?: 'Post'
          id: string
          title: string
          url: string
          publishedAt: string
          slug: string
          brief: string
          comments: {
            __typename?: 'PostCommentConnection'
            totalDocuments: number
          }
          author: {
            __typename?: 'User'
            name: string
            profilePicture?: string | null
          }
          coverImage?: { __typename?: 'PostCoverImage'; url: string } | null
        }
      }>
      pageInfo: {
        __typename?: 'PageInfo'
        endCursor?: string | null
        hasNextPage?: boolean | null
      }
    }
  } | null
}

export type PublicationByHostQueryVariables = Exact<{
  host: Scalars['String']['input']
}>

export type PublicationByHostQuery = {
  __typename?: 'Query'
  publication?: {
    __typename?: 'Publication'
    id: string
    title: string
    displayTitle?: string | null
    url: string
    metaTags?: string | null
    favicon?: string | null
    isTeam: boolean
    followersCount?: number | null
    descriptionSEO?: string | null
    posts: { __typename?: 'PublicationPostConnection'; totalDocuments: number }
    author: {
      __typename?: 'User'
      name: string
      username: string
      profilePicture?: string | null
      followersCount: number
    }
    ogMetaData: { __typename?: 'OpenGraphMetaData'; image?: string | null }
    preferences: {
      __typename?: 'Preferences'
      logo?: string | null
      darkMode?: {
        __typename?: 'DarkModePreferences'
        logo?: string | null
      } | null
      navbarItems: Array<{
        __typename?: 'PublicationNavbarItem'
        id: string
        type: PublicationNavigationType
        label?: string | null
        url?: string | null
      }>
    }
    links?: {
      __typename?: 'PublicationLinks'
      twitter?: string | null
      github?: string | null
      linkedin?: string | null
      hashnode?: string | null
    } | null
    integrations?: {
      __typename?: 'PublicationIntegrations'
      umamiWebsiteUUID?: string | null
      gaTrackingID?: string | null
      fbPixelID?: string | null
      hotjarSiteID?: string | null
      matomoURL?: string | null
      matomoSiteID?: string | null
      fathomSiteID?: string | null
      fathomCustomDomain?: string | null
      fathomCustomDomainEnabled?: boolean | null
      plausibleAnalyticsEnabled?: boolean | null
    } | null
  } | null
}

export type RssFeedQueryVariables = Exact<{
  host: Scalars['String']['input']
  first: Scalars['Int']['input']
  after?: InputMaybe<Scalars['String']['input']>
}>

export type RssFeedQuery = {
  __typename?: 'Query'
  publication?: {
    __typename?: 'Publication'
    id: string
    title: string
    displayTitle?: string | null
    url: string
    metaTags?: string | null
    favicon?: string | null
    isTeam: boolean
    followersCount?: number | null
    descriptionSEO?: string | null
    posts: {
      __typename?: 'PublicationPostConnection'
      edges: Array<{
        __typename?: 'PostEdge'
        node: {
          __typename?: 'Post'
          id: string
          title: string
          url: string
          slug: string
          content: { __typename?: 'Content'; html: string }
          tags?: Array<{
            __typename?: 'Tag'
            id: string
            name: string
            slug: string
          }> | null
          author: { __typename?: 'User'; name: string; username: string }
        }
      }>
      pageInfo: {
        __typename?: 'PageInfo'
        endCursor?: string | null
        hasNextPage?: boolean | null
      }
    }
    author: {
      __typename?: 'User'
      name: string
      username: string
      profilePicture?: string | null
      followersCount: number
    }
    ogMetaData: { __typename?: 'OpenGraphMetaData'; image?: string | null }
    preferences: {
      __typename?: 'Preferences'
      logo?: string | null
      darkMode?: {
        __typename?: 'DarkModePreferences'
        logo?: string | null
      } | null
      navbarItems: Array<{
        __typename?: 'PublicationNavbarItem'
        id: string
        type: PublicationNavigationType
        label?: string | null
        url?: string | null
      }>
    }
    links?: {
      __typename?: 'PublicationLinks'
      twitter?: string | null
      github?: string | null
      linkedin?: string | null
      hashnode?: string | null
    } | null
    integrations?: {
      __typename?: 'PublicationIntegrations'
      umamiWebsiteUUID?: string | null
      gaTrackingID?: string | null
      fbPixelID?: string | null
      hotjarSiteID?: string | null
      matomoURL?: string | null
      matomoSiteID?: string | null
      fathomSiteID?: string | null
      fathomCustomDomain?: string | null
      fathomCustomDomainEnabled?: boolean | null
      plausibleAnalyticsEnabled?: boolean | null
    } | null
  } | null
}

export type SinglePostByPublicationQueryVariables = Exact<{
  slug: Scalars['String']['input']
  host: Scalars['String']['input']
}>

export type SinglePostByPublicationQuery = {
  __typename?: 'Query'
  publication?: {
    __typename?: 'Publication'
    id: string
    title: string
    displayTitle?: string | null
    url: string
    metaTags?: string | null
    favicon?: string | null
    isTeam: boolean
    followersCount?: number | null
    descriptionSEO?: string | null
    post?: {
      __typename?: 'Post'
      id: string
      slug: string
      url: string
      brief: string
      title: string
      subtitle?: string | null
      hasLatexInPost: boolean
      publishedAt: string
      updatedAt?: string | null
      readTimeInMinutes: number
      reactionCount: number
      responseCount: number
      publication?: { __typename?: 'Publication'; id: string } | null
      seo?: {
        __typename?: 'SEO'
        title?: string | null
        description?: string | null
      } | null
      coverImage?: { __typename?: 'PostCoverImage'; url: string } | null
      author: {
        __typename?: 'User'
        name: string
        username: string
        profilePicture?: string | null
      }
      content: { __typename?: 'Content'; markdown: string; html: string }
      ogMetaData?: {
        __typename?: 'OpenGraphMetaData'
        image?: string | null
      } | null
      tags?: Array<{
        __typename?: 'Tag'
        id: string
        name: string
        slug: string
      }> | null
      features: {
        __typename?: 'PostFeatures'
        tableOfContents: {
          __typename?: 'TableOfContentsFeature'
          isEnabled: boolean
          items: Array<{
            __typename?: 'TableOfContentsItem'
            id: string
            level: number
            parentId?: string | null
            slug: string
            title: string
          }>
        }
      }
      preferences: { __typename?: 'PostPreferences'; disableComments: boolean }
      comments: {
        __typename?: 'PostCommentConnection'
        totalDocuments: number
        edges: Array<{
          __typename?: 'PostCommentEdge'
          node: {
            __typename?: 'Comment'
            id: string
            totalReactions: number
            content: { __typename?: 'Content'; markdown: string }
            author: {
              __typename?: 'User'
              name: string
              username: string
              profilePicture?: string | null
            }
          }
        }>
      }
    } | null
    author: {
      __typename?: 'User'
      name: string
      username: string
      profilePicture?: string | null
      followersCount: number
    }
    ogMetaData: { __typename?: 'OpenGraphMetaData'; image?: string | null }
    preferences: {
      __typename?: 'Preferences'
      logo?: string | null
      darkMode?: {
        __typename?: 'DarkModePreferences'
        logo?: string | null
      } | null
      navbarItems: Array<{
        __typename?: 'PublicationNavbarItem'
        id: string
        type: PublicationNavigationType
        label?: string | null
        url?: string | null
      }>
    }
    links?: {
      __typename?: 'PublicationLinks'
      twitter?: string | null
      github?: string | null
      linkedin?: string | null
      hashnode?: string | null
    } | null
    integrations?: {
      __typename?: 'PublicationIntegrations'
      umamiWebsiteUUID?: string | null
      gaTrackingID?: string | null
      fbPixelID?: string | null
      hotjarSiteID?: string | null
      matomoURL?: string | null
      matomoSiteID?: string | null
      fathomSiteID?: string | null
      fathomCustomDomain?: string | null
      fathomCustomDomainEnabled?: boolean | null
      plausibleAnalyticsEnabled?: boolean | null
    } | null
  } | null
}

export type PostFullFragment = {
  __typename?: 'Post'
  id: string
  slug: string
  url: string
  brief: string
  title: string
  subtitle?: string | null
  hasLatexInPost: boolean
  publishedAt: string
  updatedAt?: string | null
  readTimeInMinutes: number
  reactionCount: number
  responseCount: number
  publication?: { __typename?: 'Publication'; id: string } | null
  seo?: {
    __typename?: 'SEO'
    title?: string | null
    description?: string | null
  } | null
  coverImage?: { __typename?: 'PostCoverImage'; url: string } | null
  author: {
    __typename?: 'User'
    name: string
    username: string
    profilePicture?: string | null
  }
  content: { __typename?: 'Content'; markdown: string; html: string }
  ogMetaData?: {
    __typename?: 'OpenGraphMetaData'
    image?: string | null
  } | null
  tags?: Array<{
    __typename?: 'Tag'
    id: string
    name: string
    slug: string
  }> | null
  features: {
    __typename?: 'PostFeatures'
    tableOfContents: {
      __typename?: 'TableOfContentsFeature'
      isEnabled: boolean
      items: Array<{
        __typename?: 'TableOfContentsItem'
        id: string
        level: number
        parentId?: string | null
        slug: string
        title: string
      }>
    }
  }
  preferences: { __typename?: 'PostPreferences'; disableComments: boolean }
  comments: {
    __typename?: 'PostCommentConnection'
    totalDocuments: number
    edges: Array<{
      __typename?: 'PostCommentEdge'
      node: {
        __typename?: 'Comment'
        id: string
        totalReactions: number
        content: { __typename?: 'Content'; markdown: string }
        author: {
          __typename?: 'User'
          name: string
          username: string
          profilePicture?: string | null
        }
      }
    }>
  }
}

export type SitemapQueryVariables = Exact<{
  host: Scalars['String']['input']
  postsCount: Scalars['Int']['input']
  postsAfter?: InputMaybe<Scalars['String']['input']>
  staticPagesCount: Scalars['Int']['input']
}>

export type SitemapQuery = {
  __typename?: 'Query'
  publication?: {
    __typename?: 'Publication'
    id: string
    url: string
    staticPages: {
      __typename?: 'StaticPageConnection'
      edges: Array<{
        __typename?: 'StaticPageEdge'
        node: { __typename?: 'StaticPage'; slug: string }
      }>
    }
    posts: {
      __typename?: 'PublicationPostConnection'
      edges: Array<{
        __typename?: 'PostEdge'
        node: {
          __typename?: 'Post'
          id: string
          url: string
          slug: string
          publishedAt: string
          updatedAt?: string | null
          tags?: Array<{
            __typename?: 'Tag'
            id: string
            name: string
            slug: string
          }> | null
        }
      }>
      pageInfo: {
        __typename?: 'PageInfo'
        endCursor?: string | null
        hasNextPage?: boolean | null
      }
    }
  } | null
}

export type MoreSitemapPostsQueryVariables = Exact<{
  host: Scalars['String']['input']
  postsCount: Scalars['Int']['input']
  postsAfter?: InputMaybe<Scalars['String']['input']>
}>

export type MoreSitemapPostsQuery = {
  __typename?: 'Query'
  publication?: {
    __typename?: 'Publication'
    id: string
    posts: {
      __typename?: 'PublicationPostConnection'
      edges: Array<{
        __typename?: 'PostEdge'
        node: {
          __typename?: 'Post'
          id: string
          url: string
          slug: string
          publishedAt: string
          updatedAt?: string | null
          tags?: Array<{
            __typename?: 'Tag'
            id: string
            name: string
            slug: string
          }> | null
        }
      }>
      pageInfo: {
        __typename?: 'PageInfo'
        endCursor?: string | null
        hasNextPage?: boolean | null
      }
    }
  } | null
}

export type RequiredSitemapPostFieldsFragment = {
  __typename?: 'Post'
  id: string
  url: string
  slug: string
  publishedAt: string
  updatedAt?: string | null
  tags?: Array<{
    __typename?: 'Tag'
    id: string
    name: string
    slug: string
  }> | null
}

export type SlugPostsByPublicationQueryVariables = Exact<{
  host: Scalars['String']['input']
  first: Scalars['Int']['input']
  after?: InputMaybe<Scalars['String']['input']>
}>

export type SlugPostsByPublicationQuery = {
  __typename?: 'Query'
  publication?: {
    __typename?: 'Publication'
    id: string
    title: string
    displayTitle?: string | null
    url: string
    metaTags?: string | null
    favicon?: string | null
    isTeam: boolean
    followersCount?: number | null
    descriptionSEO?: string | null
    posts: {
      __typename?: 'PublicationPostConnection'
      edges: Array<{
        __typename?: 'PostEdge'
        node: { __typename?: 'Post'; slug: string }
      }>
    }
    author: {
      __typename?: 'User'
      name: string
      username: string
      profilePicture?: string | null
      followersCount: number
    }
    ogMetaData: { __typename?: 'OpenGraphMetaData'; image?: string | null }
    preferences: {
      __typename?: 'Preferences'
      logo?: string | null
      darkMode?: {
        __typename?: 'DarkModePreferences'
        logo?: string | null
      } | null
      navbarItems: Array<{
        __typename?: 'PublicationNavbarItem'
        id: string
        type: PublicationNavigationType
        label?: string | null
        url?: string | null
      }>
    }
    links?: {
      __typename?: 'PublicationLinks'
      twitter?: string | null
      github?: string | null
      linkedin?: string | null
      hashnode?: string | null
    } | null
    integrations?: {
      __typename?: 'PublicationIntegrations'
      umamiWebsiteUUID?: string | null
      gaTrackingID?: string | null
      fbPixelID?: string | null
      hotjarSiteID?: string | null
      matomoURL?: string | null
      matomoSiteID?: string | null
      fathomSiteID?: string | null
      fathomCustomDomain?: string | null
      fathomCustomDomainEnabled?: boolean | null
      plausibleAnalyticsEnabled?: boolean | null
    } | null
  } | null
}

export type TagPostsByPublicationQueryVariables = Exact<{
  host: Scalars['String']['input']
  tagSlug: Scalars['String']['input']
  first: Scalars['Int']['input']
  after?: InputMaybe<Scalars['String']['input']>
}>

export type TagPostsByPublicationQuery = {
  __typename?: 'Query'
  publication?: {
    __typename?: 'Publication'
    id: string
    title: string
    displayTitle?: string | null
    url: string
    metaTags?: string | null
    favicon?: string | null
    isTeam: boolean
    followersCount?: number | null
    descriptionSEO?: string | null
    posts: {
      __typename?: 'PublicationPostConnection'
      totalDocuments: number
      edges: Array<{
        __typename?: 'PostEdge'
        node: {
          __typename?: 'Post'
          id: string
          title: string
          url: string
          publishedAt: string
          slug: string
          brief: string
          author: {
            __typename?: 'User'
            name: string
            profilePicture?: string | null
          }
          coverImage?: { __typename?: 'PostCoverImage'; url: string } | null
          comments: {
            __typename?: 'PostCommentConnection'
            totalDocuments: number
          }
        }
      }>
    }
    author: {
      __typename?: 'User'
      name: string
      username: string
      profilePicture?: string | null
      followersCount: number
    }
    ogMetaData: { __typename?: 'OpenGraphMetaData'; image?: string | null }
    preferences: {
      __typename?: 'Preferences'
      logo?: string | null
      darkMode?: {
        __typename?: 'DarkModePreferences'
        logo?: string | null
      } | null
      navbarItems: Array<{
        __typename?: 'PublicationNavbarItem'
        id: string
        type: PublicationNavigationType
        label?: string | null
        url?: string | null
      }>
    }
    links?: {
      __typename?: 'PublicationLinks'
      twitter?: string | null
      github?: string | null
      linkedin?: string | null
      hashnode?: string | null
    } | null
    integrations?: {
      __typename?: 'PublicationIntegrations'
      umamiWebsiteUUID?: string | null
      gaTrackingID?: string | null
      fbPixelID?: string | null
      hotjarSiteID?: string | null
      matomoURL?: string | null
      matomoSiteID?: string | null
      fathomSiteID?: string | null
      fathomCustomDomain?: string | null
      fathomCustomDomainEnabled?: boolean | null
      plausibleAnalyticsEnabled?: boolean | null
    } | null
  } | null
}

export const PageInfoFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'PageInfo' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'PageInfo' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'endCursor' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasNextPage' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<PageInfoFragment, unknown>
export const PostFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Post' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Post' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'coverImage' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
              ],
            },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'publishedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'brief' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'comments' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'first' },
                value: { kind: 'IntValue', value: '0' },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'totalDocuments' },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<PostFragment, unknown>
export const PublicationFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Publication' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Publication' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'displayTitle' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'metaTags' } },
          { kind: 'Field', name: { kind: 'Name', value: 'favicon' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTeam' } },
          { kind: 'Field', name: { kind: 'Name', value: 'followersCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'descriptionSEO' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'username' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'followersCount' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ogMetaData' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'image' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'preferences' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'darkMode' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'navbarItems' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'links' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'twitter' } },
                { kind: 'Field', name: { kind: 'Name', value: 'github' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linkedin' } },
                { kind: 'Field', name: { kind: 'Name', value: 'hashnode' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'integrations' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'umamiWebsiteUUID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'gaTrackingID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'fbPixelID' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'hotjarSiteID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'matomoURL' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'matomoSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomain' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomainEnabled' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'plausibleAnalyticsEnabled' },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<PublicationFragment, unknown>
export const StaticPageFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'StaticPage' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'StaticPage' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'content' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'markdown' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<StaticPageFragment, unknown>
export const PostFullFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'PostFull' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Post' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'brief' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subtitle' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasLatexInPost' } },
          { kind: 'Field', name: { kind: 'Name', value: 'publishedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'readTimeInMinutes' } },
          { kind: 'Field', name: { kind: 'Name', value: 'reactionCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'responseCount' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'publication' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'seo' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'coverImage' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'username' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
              ],
            },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'content' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'markdown' } },
                { kind: 'Field', name: { kind: 'Name', value: 'html' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ogMetaData' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'image' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'tags' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'features' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'tableOfContents' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'isEnabled' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'items' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'level' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'parentId' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'slug' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'title' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'preferences' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'disableComments' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'comments' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'first' },
                value: { kind: 'IntValue', value: '25' },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'totalDocuments' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'edges' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'node' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'totalReactions' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'content' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'markdown' },
                                  },
                                ],
                              },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'author' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'name' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'username' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: {
                                      kind: 'Name',
                                      value: 'profilePicture',
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<PostFullFragment, unknown>
export const RequiredSitemapPostFieldsFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'RequiredSitemapPostFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Post' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'publishedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'tags' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RequiredSitemapPostFieldsFragment, unknown>
export const DraftByIdDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'DraftById' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'ObjectId' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'draft' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'id' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'content' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'markdown' },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'author' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'username' },
                      },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'dateUpdated' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'tags' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DraftByIdQuery, DraftByIdQueryVariables>
export const PageByPublicationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'PageByPublication' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'slug' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'host' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'publication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'host' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'host' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'Publication' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'staticPage' },
                  arguments: [
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'slug' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'slug' },
                      },
                    },
                  ],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'FragmentSpread',
                        name: { kind: 'Name', value: 'StaticPage' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Publication' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Publication' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'displayTitle' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'metaTags' } },
          { kind: 'Field', name: { kind: 'Name', value: 'favicon' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTeam' } },
          { kind: 'Field', name: { kind: 'Name', value: 'followersCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'descriptionSEO' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'username' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'followersCount' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ogMetaData' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'image' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'preferences' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'darkMode' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'navbarItems' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'links' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'twitter' } },
                { kind: 'Field', name: { kind: 'Name', value: 'github' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linkedin' } },
                { kind: 'Field', name: { kind: 'Name', value: 'hashnode' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'integrations' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'umamiWebsiteUUID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'gaTrackingID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'fbPixelID' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'hotjarSiteID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'matomoURL' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'matomoSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomain' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomainEnabled' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'plausibleAnalyticsEnabled' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'StaticPage' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'StaticPage' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'content' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'markdown' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  PageByPublicationQuery,
  PageByPublicationQueryVariables
>
export const PostsByPublicationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'PostsByPublication' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'host' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'first' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'after' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'publication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'host' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'host' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'Publication' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'posts' },
                  arguments: [
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'first' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'first' },
                      },
                    },
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'after' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'after' },
                      },
                    },
                  ],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'totalDocuments' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'edges' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'node' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'FragmentSpread',
                                    name: { kind: 'Name', value: 'Post' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'comments' },
                                    arguments: [
                                      {
                                        kind: 'Argument',
                                        name: { kind: 'Name', value: 'first' },
                                        value: { kind: 'IntValue', value: '0' },
                                      },
                                    ],
                                    selectionSet: {
                                      kind: 'SelectionSet',
                                      selections: [
                                        {
                                          kind: 'Field',
                                          name: {
                                            kind: 'Name',
                                            value: 'totalDocuments',
                                          },
                                        },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'pageInfo' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'FragmentSpread',
                              name: { kind: 'Name', value: 'PageInfo' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Publication' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Publication' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'displayTitle' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'metaTags' } },
          { kind: 'Field', name: { kind: 'Name', value: 'favicon' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTeam' } },
          { kind: 'Field', name: { kind: 'Name', value: 'followersCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'descriptionSEO' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'username' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'followersCount' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ogMetaData' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'image' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'preferences' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'darkMode' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'navbarItems' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'links' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'twitter' } },
                { kind: 'Field', name: { kind: 'Name', value: 'github' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linkedin' } },
                { kind: 'Field', name: { kind: 'Name', value: 'hashnode' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'integrations' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'umamiWebsiteUUID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'gaTrackingID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'fbPixelID' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'hotjarSiteID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'matomoURL' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'matomoSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomain' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomainEnabled' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'plausibleAnalyticsEnabled' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Post' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Post' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'coverImage' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
              ],
            },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'publishedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'brief' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'comments' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'first' },
                value: { kind: 'IntValue', value: '0' },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'totalDocuments' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'PageInfo' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'PageInfo' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'endCursor' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasNextPage' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  PostsByPublicationQuery,
  PostsByPublicationQueryVariables
>
export const MorePostsByPublicationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'MorePostsByPublication' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'host' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'first' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'after' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'publication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'host' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'host' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'posts' },
                  arguments: [
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'first' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'first' },
                      },
                    },
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'after' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'after' },
                      },
                    },
                  ],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'edges' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'node' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'FragmentSpread',
                                    name: { kind: 'Name', value: 'Post' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'comments' },
                                    arguments: [
                                      {
                                        kind: 'Argument',
                                        name: { kind: 'Name', value: 'first' },
                                        value: { kind: 'IntValue', value: '0' },
                                      },
                                    ],
                                    selectionSet: {
                                      kind: 'SelectionSet',
                                      selections: [
                                        {
                                          kind: 'Field',
                                          name: {
                                            kind: 'Name',
                                            value: 'totalDocuments',
                                          },
                                        },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'pageInfo' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'FragmentSpread',
                              name: { kind: 'Name', value: 'PageInfo' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Post' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Post' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'coverImage' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
              ],
            },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'publishedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'brief' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'comments' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'first' },
                value: { kind: 'IntValue', value: '0' },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'totalDocuments' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'PageInfo' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'PageInfo' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'endCursor' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasNextPage' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  MorePostsByPublicationQuery,
  MorePostsByPublicationQueryVariables
>
export const PublicationByHostDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'PublicationByHost' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'host' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'publication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'host' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'host' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'Publication' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'posts' },
                  arguments: [
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'first' },
                      value: { kind: 'IntValue', value: '0' },
                    },
                  ],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'totalDocuments' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Publication' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Publication' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'displayTitle' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'metaTags' } },
          { kind: 'Field', name: { kind: 'Name', value: 'favicon' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTeam' } },
          { kind: 'Field', name: { kind: 'Name', value: 'followersCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'descriptionSEO' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'username' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'followersCount' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ogMetaData' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'image' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'preferences' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'darkMode' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'navbarItems' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'links' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'twitter' } },
                { kind: 'Field', name: { kind: 'Name', value: 'github' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linkedin' } },
                { kind: 'Field', name: { kind: 'Name', value: 'hashnode' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'integrations' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'umamiWebsiteUUID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'gaTrackingID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'fbPixelID' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'hotjarSiteID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'matomoURL' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'matomoSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomain' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomainEnabled' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'plausibleAnalyticsEnabled' },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  PublicationByHostQuery,
  PublicationByHostQueryVariables
>
export const RssFeedDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'RSSFeed' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'host' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'first' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'after' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'publication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'host' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'host' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'Publication' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'posts' },
                  arguments: [
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'first' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'first' },
                      },
                    },
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'after' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'after' },
                      },
                    },
                  ],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'edges' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'node' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'id' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'title' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'url' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'slug' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'content' },
                                    selectionSet: {
                                      kind: 'SelectionSet',
                                      selections: [
                                        {
                                          kind: 'Field',
                                          name: { kind: 'Name', value: 'html' },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'tags' },
                                    selectionSet: {
                                      kind: 'SelectionSet',
                                      selections: [
                                        {
                                          kind: 'Field',
                                          name: { kind: 'Name', value: 'id' },
                                        },
                                        {
                                          kind: 'Field',
                                          name: { kind: 'Name', value: 'name' },
                                        },
                                        {
                                          kind: 'Field',
                                          name: { kind: 'Name', value: 'slug' },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'author' },
                                    selectionSet: {
                                      kind: 'SelectionSet',
                                      selections: [
                                        {
                                          kind: 'Field',
                                          name: { kind: 'Name', value: 'name' },
                                        },
                                        {
                                          kind: 'Field',
                                          name: {
                                            kind: 'Name',
                                            value: 'username',
                                          },
                                        },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'pageInfo' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'FragmentSpread',
                              name: { kind: 'Name', value: 'PageInfo' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Publication' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Publication' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'displayTitle' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'metaTags' } },
          { kind: 'Field', name: { kind: 'Name', value: 'favicon' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTeam' } },
          { kind: 'Field', name: { kind: 'Name', value: 'followersCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'descriptionSEO' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'username' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'followersCount' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ogMetaData' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'image' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'preferences' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'darkMode' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'navbarItems' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'links' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'twitter' } },
                { kind: 'Field', name: { kind: 'Name', value: 'github' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linkedin' } },
                { kind: 'Field', name: { kind: 'Name', value: 'hashnode' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'integrations' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'umamiWebsiteUUID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'gaTrackingID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'fbPixelID' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'hotjarSiteID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'matomoURL' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'matomoSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomain' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomainEnabled' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'plausibleAnalyticsEnabled' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'PageInfo' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'PageInfo' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'endCursor' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasNextPage' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RssFeedQuery, RssFeedQueryVariables>
export const SinglePostByPublicationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'SinglePostByPublication' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'slug' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'host' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'publication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'host' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'host' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'Publication' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'post' },
                  arguments: [
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'slug' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'slug' },
                      },
                    },
                  ],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'FragmentSpread',
                        name: { kind: 'Name', value: 'PostFull' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Publication' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Publication' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'displayTitle' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'metaTags' } },
          { kind: 'Field', name: { kind: 'Name', value: 'favicon' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTeam' } },
          { kind: 'Field', name: { kind: 'Name', value: 'followersCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'descriptionSEO' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'username' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'followersCount' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ogMetaData' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'image' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'preferences' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'darkMode' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'navbarItems' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'links' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'twitter' } },
                { kind: 'Field', name: { kind: 'Name', value: 'github' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linkedin' } },
                { kind: 'Field', name: { kind: 'Name', value: 'hashnode' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'integrations' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'umamiWebsiteUUID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'gaTrackingID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'fbPixelID' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'hotjarSiteID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'matomoURL' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'matomoSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomain' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomainEnabled' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'plausibleAnalyticsEnabled' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'PostFull' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Post' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'brief' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'subtitle' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasLatexInPost' } },
          { kind: 'Field', name: { kind: 'Name', value: 'publishedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'readTimeInMinutes' } },
          { kind: 'Field', name: { kind: 'Name', value: 'reactionCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'responseCount' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'publication' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'seo' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'coverImage' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'username' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
              ],
            },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'content' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'markdown' } },
                { kind: 'Field', name: { kind: 'Name', value: 'html' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ogMetaData' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'image' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'tags' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'features' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'tableOfContents' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'isEnabled' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'items' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'level' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'parentId' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'slug' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'title' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'preferences' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'disableComments' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'comments' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'first' },
                value: { kind: 'IntValue', value: '25' },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'totalDocuments' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'edges' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'node' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'totalReactions' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'content' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'markdown' },
                                  },
                                ],
                              },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'author' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'name' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'username' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: {
                                      kind: 'Name',
                                      value: 'profilePicture',
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SinglePostByPublicationQuery,
  SinglePostByPublicationQueryVariables
>
export const SitemapDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Sitemap' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'host' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'postsCount' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'postsAfter' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'staticPagesCount' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'publication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'host' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'host' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'staticPages' },
                  arguments: [
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'first' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'staticPagesCount' },
                      },
                    },
                  ],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'edges' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'node' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'slug' },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'posts' },
                  arguments: [
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'first' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'postsCount' },
                      },
                    },
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'after' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'postsAfter' },
                      },
                    },
                  ],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'edges' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'node' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'FragmentSpread',
                                    name: {
                                      kind: 'Name',
                                      value: 'RequiredSitemapPostFields',
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'pageInfo' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'FragmentSpread',
                              name: { kind: 'Name', value: 'PageInfo' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'RequiredSitemapPostFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Post' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'publishedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'tags' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'PageInfo' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'PageInfo' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'endCursor' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasNextPage' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SitemapQuery, SitemapQueryVariables>
export const MoreSitemapPostsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'MoreSitemapPosts' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'host' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'postsCount' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'postsAfter' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'publication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'host' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'host' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'posts' },
                  arguments: [
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'first' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'postsCount' },
                      },
                    },
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'after' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'postsAfter' },
                      },
                    },
                  ],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'edges' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'node' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'FragmentSpread',
                                    name: {
                                      kind: 'Name',
                                      value: 'RequiredSitemapPostFields',
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'pageInfo' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'FragmentSpread',
                              name: { kind: 'Name', value: 'PageInfo' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'RequiredSitemapPostFields' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Post' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'publishedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'tags' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'PageInfo' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'PageInfo' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'endCursor' } },
          { kind: 'Field', name: { kind: 'Name', value: 'hasNextPage' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  MoreSitemapPostsQuery,
  MoreSitemapPostsQueryVariables
>
export const SlugPostsByPublicationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'SlugPostsByPublication' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'host' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'first' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'after' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'publication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'host' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'host' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'Publication' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'posts' },
                  arguments: [
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'first' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'first' },
                      },
                    },
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'after' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'after' },
                      },
                    },
                  ],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'edges' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'node' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'slug' },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Publication' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Publication' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'displayTitle' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'metaTags' } },
          { kind: 'Field', name: { kind: 'Name', value: 'favicon' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTeam' } },
          { kind: 'Field', name: { kind: 'Name', value: 'followersCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'descriptionSEO' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'username' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'followersCount' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ogMetaData' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'image' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'preferences' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'darkMode' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'navbarItems' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'links' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'twitter' } },
                { kind: 'Field', name: { kind: 'Name', value: 'github' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linkedin' } },
                { kind: 'Field', name: { kind: 'Name', value: 'hashnode' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'integrations' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'umamiWebsiteUUID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'gaTrackingID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'fbPixelID' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'hotjarSiteID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'matomoURL' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'matomoSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomain' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomainEnabled' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'plausibleAnalyticsEnabled' },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SlugPostsByPublicationQuery,
  SlugPostsByPublicationQueryVariables
>
export const TagPostsByPublicationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'TagPostsByPublication' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'host' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'tagSlug' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'first' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'after' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'publication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'host' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'host' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'Publication' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'posts' },
                  arguments: [
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'first' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'first' },
                      },
                    },
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'filter' },
                      value: {
                        kind: 'ObjectValue',
                        fields: [
                          {
                            kind: 'ObjectField',
                            name: { kind: 'Name', value: 'tagSlugs' },
                            value: {
                              kind: 'ListValue',
                              values: [
                                {
                                  kind: 'Variable',
                                  name: { kind: 'Name', value: 'tagSlug' },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                    {
                      kind: 'Argument',
                      name: { kind: 'Name', value: 'after' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'after' },
                      },
                    },
                  ],
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'totalDocuments' },
                      },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'edges' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'node' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'FragmentSpread',
                                    name: { kind: 'Name', value: 'Post' },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Publication' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Publication' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'displayTitle' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          { kind: 'Field', name: { kind: 'Name', value: 'metaTags' } },
          { kind: 'Field', name: { kind: 'Name', value: 'favicon' } },
          { kind: 'Field', name: { kind: 'Name', value: 'isTeam' } },
          { kind: 'Field', name: { kind: 'Name', value: 'followersCount' } },
          { kind: 'Field', name: { kind: 'Name', value: 'descriptionSEO' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'username' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'followersCount' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'ogMetaData' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'image' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'preferences' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'darkMode' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'logo' } },
                    ],
                  },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'navbarItems' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'links' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'twitter' } },
                { kind: 'Field', name: { kind: 'Name', value: 'github' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linkedin' } },
                { kind: 'Field', name: { kind: 'Name', value: 'hashnode' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'integrations' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'umamiWebsiteUUID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'gaTrackingID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'fbPixelID' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'hotjarSiteID' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'matomoURL' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'matomoSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomSiteID' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomain' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'fathomCustomDomainEnabled' },
                },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'plausibleAnalyticsEnabled' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Post' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Post' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'title' } },
          { kind: 'Field', name: { kind: 'Name', value: 'url' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'author' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'profilePicture' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'coverImage' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
              ],
            },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'publishedAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'slug' } },
          { kind: 'Field', name: { kind: 'Name', value: 'brief' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'comments' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'first' },
                value: { kind: 'IntValue', value: '0' },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'totalDocuments' },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  TagPostsByPublicationQuery,
  TagPostsByPublicationQueryVariables
>
