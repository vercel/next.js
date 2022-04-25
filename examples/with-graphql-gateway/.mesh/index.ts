// @ts-nocheck
import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';

export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  /** The `String` scalar type represents textual data, represented as UTF-8 character sequences. The String type is most often used by GraphQL to represent free-form human-readable text. */
  String: string;
  /** The `Boolean` scalar type represents `true` or `false`. */
  Boolean: boolean;
  /** The `Int` scalar type represents non-fractional signed whole numeric values. Int can represent values between -(2^31) and 2^31 - 1. */
  Int: number;
  Float: number;
  /** The `BigInt` scalar type represents non-fractional signed whole numeric values. */
  BigInt: bigint;
  /** A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar. */
  DateTime: Date | string;
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSON: any;
  Any: any;
};

export type Query = {
  /** Multiple status values can be provided with comma separated strings */
  findPetsByStatus?: Maybe<Array<Maybe<Pet>>>;
  /** Multiple tags can be provided with comma separated strings. Use tag1, tag2, tag3 for testing. */
  findPetsByTags?: Maybe<Array<Maybe<Pet>>>;
  /** Returns a single pet */
  getPetById?: Maybe<Pet>;
  /** For valid response try integer IDs with value >= 1 and <= 10. Other values will generated exceptions */
  getOrderById?: Maybe<Order>;
  /** Returns a map of status codes to quantities */
  getInventory?: Maybe<getInventory_200_response>;
  /** Get user by user name */
  getUserByName?: Maybe<User>;
  /** Logs user into the system */
  loginUser?: Maybe<Scalars['String']>;
  /** Logs out current logged in user session */
  logoutUser?: Maybe<Scalars['Any']>;
};


export type QueryfindPetsByStatusArgs = {
  input: findPetsByStatus_request_Input;
};


export type QueryfindPetsByTagsArgs = {
  input: findPetsByTags_request_Input;
};


export type QuerygetPetByIdArgs = {
  petId: Scalars['Int'];
};


export type QuerygetOrderByIdArgs = {
  orderId: Scalars['Int'];
};


export type QuerygetUserByNameArgs = {
  username: Scalars['String'];
};


export type QueryloginUserArgs = {
  input: loginUser_request_Input;
};

export type Pet = {
  id?: Maybe<Scalars['BigInt']>;
  category?: Maybe<Category>;
  name: Scalars['String'];
  photoUrls: Array<Maybe<Scalars['String']>>;
  tags?: Maybe<Array<Maybe<Tag>>>;
  status?: Maybe<mutationInput_addPet_status>;
};

export type Category = {
  id?: Maybe<Scalars['BigInt']>;
  name?: Maybe<Scalars['String']>;
};

export type Tag = {
  id?: Maybe<Scalars['BigInt']>;
  name?: Maybe<Scalars['String']>;
};

/** pet status in the store */
export type mutationInput_addPet_status =
  | 'available'
  | 'pending'
  | 'sold';

export type findPetsByStatus_request_Input = {
  /** Status values that need to be considered for filter */
  status: Array<InputMaybe<queryInput_findPetsByStatus_status_items>>;
};

export type queryInput_findPetsByStatus_status_items =
  | 'available'
  | 'pending'
  | 'sold';

export type findPetsByTags_request_Input = {
  /** Tags to filter by */
  tags: Array<InputMaybe<Scalars['String']>>;
};

export type Order = {
  id?: Maybe<Scalars['BigInt']>;
  petId?: Maybe<Scalars['BigInt']>;
  quantity?: Maybe<Scalars['Int']>;
  shipDate?: Maybe<Scalars['DateTime']>;
  status?: Maybe<mutation_placeOrder_status>;
  complete?: Maybe<Scalars['Boolean']>;
};

/** Order Status */
export type mutation_placeOrder_status =
  | 'placed'
  | 'approved'
  | 'delivered';

export type getInventory_200_response = {
  additionalProperties?: Maybe<Scalars['JSON']>;
};

export type User = {
  id?: Maybe<Scalars['BigInt']>;
  username?: Maybe<Scalars['String']>;
  firstName?: Maybe<Scalars['String']>;
  lastName?: Maybe<Scalars['String']>;
  email?: Maybe<Scalars['String']>;
  password?: Maybe<Scalars['String']>;
  phone?: Maybe<Scalars['String']>;
  /** User Status */
  userStatus?: Maybe<Scalars['Int']>;
};

export type loginUser_request_Input = {
  /** The user name for login */
  username: Scalars['String'];
  /** The password for login in clear text */
  password: Scalars['String'];
};

export type Mutation = {
  /** uploads an image */
  uploadFile?: Maybe<ApiResponse>;
  /** Add a new pet to the store */
  addPet?: Maybe<Scalars['Any']>;
  /** Update an existing pet */
  updatePet?: Maybe<Scalars['Any']>;
  /** Updates a pet in the store with form data */
  updatePetWithForm?: Maybe<Scalars['Any']>;
  /** Deletes a pet */
  deletePet?: Maybe<Scalars['Any']>;
  /** Place an order for a pet */
  placeOrder?: Maybe<Order>;
  /** For valid response try integer IDs with positive integer value. Negative or non-integer values will generate API errors */
  deleteOrder?: Maybe<Scalars['Any']>;
  /** Creates list of users with given input array */
  createUsersWithArrayInput?: Maybe<Scalars['Any']>;
  /** Creates list of users with given input array */
  createUsersWithListInput?: Maybe<Scalars['Any']>;
  /** This can only be done by the logged in user. */
  updateUser?: Maybe<Scalars['Any']>;
  /** This can only be done by the logged in user. */
  deleteUser?: Maybe<Scalars['Any']>;
  /** This can only be done by the logged in user. */
  createUser?: Maybe<Scalars['Any']>;
};


export type MutationuploadFileArgs = {
  petId: Scalars['Int'];
};


export type MutationaddPetArgs = {
  input: Pet_Input;
};


export type MutationupdatePetArgs = {
  input: Pet_Input;
};


export type MutationupdatePetWithFormArgs = {
  petId: Scalars['Int'];
};


export type MutationdeletePetArgs = {
  api_key?: InputMaybe<Scalars['String']>;
  petId: Scalars['Int'];
};


export type MutationplaceOrderArgs = {
  input?: InputMaybe<Order_Input>;
};


export type MutationdeleteOrderArgs = {
  orderId: Scalars['Int'];
};


export type MutationcreateUsersWithArrayInputArgs = {
  input?: InputMaybe<Array<InputMaybe<User_Input>>>;
};


export type MutationcreateUsersWithListInputArgs = {
  input?: InputMaybe<Array<InputMaybe<User_Input>>>;
};


export type MutationupdateUserArgs = {
  input?: InputMaybe<User_Input>;
  username: Scalars['String'];
};


export type MutationdeleteUserArgs = {
  username: Scalars['String'];
};


export type MutationcreateUserArgs = {
  input?: InputMaybe<User_Input>;
};

export type ApiResponse = {
  code?: Maybe<Scalars['Int']>;
  type?: Maybe<Scalars['String']>;
  message?: Maybe<Scalars['String']>;
};

export type Pet_Input = {
  id?: InputMaybe<Scalars['BigInt']>;
  category?: InputMaybe<Category_Input>;
  name: Scalars['String'];
  photoUrls: Array<InputMaybe<Scalars['String']>>;
  tags?: InputMaybe<Array<InputMaybe<Tag_Input>>>;
  status?: InputMaybe<mutationInput_addPet_status>;
};

export type Category_Input = {
  id?: InputMaybe<Scalars['BigInt']>;
  name?: InputMaybe<Scalars['String']>;
};

export type Tag_Input = {
  id?: InputMaybe<Scalars['BigInt']>;
  name?: InputMaybe<Scalars['String']>;
};

export type Order_Input = {
  id?: InputMaybe<Scalars['BigInt']>;
  petId?: InputMaybe<Scalars['BigInt']>;
  quantity?: InputMaybe<Scalars['Int']>;
  shipDate?: InputMaybe<Scalars['DateTime']>;
  status?: InputMaybe<mutation_placeOrder_status>;
  complete?: InputMaybe<Scalars['Boolean']>;
};

export type User_Input = {
  id?: InputMaybe<Scalars['BigInt']>;
  username?: InputMaybe<Scalars['String']>;
  firstName?: InputMaybe<Scalars['String']>;
  lastName?: InputMaybe<Scalars['String']>;
  email?: InputMaybe<Scalars['String']>;
  password?: InputMaybe<Scalars['String']>;
  phone?: InputMaybe<Scalars['String']>;
  /** User Status */
  userStatus?: InputMaybe<Scalars['Int']>;
};

export type WithIndex<TObject> = TObject & Record<string, any>;
export type ResolversObject<TObject> = WithIndex<TObject>;

export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = ResolversObject<{
  Query: ResolverTypeWrapper<{}>;
  Int: ResolverTypeWrapper<Scalars['Int']>;
  String: ResolverTypeWrapper<Scalars['String']>;
  Pet: ResolverTypeWrapper<Pet>;
  BigInt: ResolverTypeWrapper<Scalars['BigInt']>;
  Category: ResolverTypeWrapper<Category>;
  Tag: ResolverTypeWrapper<Tag>;
  mutationInput_addPet_status: mutationInput_addPet_status;
  findPetsByStatus_request_Input: findPetsByStatus_request_Input;
  queryInput_findPetsByStatus_status_items: queryInput_findPetsByStatus_status_items;
  findPetsByTags_request_Input: findPetsByTags_request_Input;
  Order: ResolverTypeWrapper<Order>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']>;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']>;
  mutation_placeOrder_status: mutation_placeOrder_status;
  getInventory_200_response: ResolverTypeWrapper<getInventory_200_response>;
  JSON: ResolverTypeWrapper<Scalars['JSON']>;
  User: ResolverTypeWrapper<User>;
  loginUser_request_Input: loginUser_request_Input;
  Any: ResolverTypeWrapper<Scalars['Any']>;
  Mutation: ResolverTypeWrapper<{}>;
  ApiResponse: ResolverTypeWrapper<ApiResponse>;
  Pet_Input: Pet_Input;
  Category_Input: Category_Input;
  Tag_Input: Tag_Input;
  Order_Input: Order_Input;
  User_Input: User_Input;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  Query: {};
  Int: Scalars['Int'];
  String: Scalars['String'];
  Pet: Pet;
  BigInt: Scalars['BigInt'];
  Category: Category;
  Tag: Tag;
  findPetsByStatus_request_Input: findPetsByStatus_request_Input;
  findPetsByTags_request_Input: findPetsByTags_request_Input;
  Order: Order;
  Boolean: Scalars['Boolean'];
  DateTime: Scalars['DateTime'];
  getInventory_200_response: getInventory_200_response;
  JSON: Scalars['JSON'];
  User: User;
  loginUser_request_Input: loginUser_request_Input;
  Any: Scalars['Any'];
  Mutation: {};
  ApiResponse: ApiResponse;
  Pet_Input: Pet_Input;
  Category_Input: Category_Input;
  Tag_Input: Tag_Input;
  Order_Input: Order_Input;
  User_Input: User_Input;
}>;

export type QueryResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = ResolversObject<{
  findPetsByStatus?: Resolver<Maybe<Array<Maybe<ResolversTypes['Pet']>>>, ParentType, ContextType, RequireFields<QueryfindPetsByStatusArgs, 'input'>>;
  findPetsByTags?: Resolver<Maybe<Array<Maybe<ResolversTypes['Pet']>>>, ParentType, ContextType, RequireFields<QueryfindPetsByTagsArgs, 'input'>>;
  getPetById?: Resolver<Maybe<ResolversTypes['Pet']>, ParentType, ContextType, RequireFields<QuerygetPetByIdArgs, 'petId'>>;
  getOrderById?: Resolver<Maybe<ResolversTypes['Order']>, ParentType, ContextType, RequireFields<QuerygetOrderByIdArgs, 'orderId'>>;
  getInventory?: Resolver<Maybe<ResolversTypes['getInventory_200_response']>, ParentType, ContextType>;
  getUserByName?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType, RequireFields<QuerygetUserByNameArgs, 'username'>>;
  loginUser?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType, RequireFields<QueryloginUserArgs, 'input'>>;
  logoutUser?: Resolver<Maybe<ResolversTypes['Any']>, ParentType, ContextType>;
}>;

export type PetResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['Pet'] = ResolversParentTypes['Pet']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  category?: Resolver<Maybe<ResolversTypes['Category']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  photoUrls?: Resolver<Array<Maybe<ResolversTypes['String']>>, ParentType, ContextType>;
  tags?: Resolver<Maybe<Array<Maybe<ResolversTypes['Tag']>>>, ParentType, ContextType>;
  status?: Resolver<Maybe<ResolversTypes['mutationInput_addPet_status']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface BigIntScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['BigInt'], any> {
  name: 'BigInt';
}

export type CategoryResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['Category'] = ResolversParentTypes['Category']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TagResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['Tag'] = ResolversParentTypes['Tag']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type OrderResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['Order'] = ResolversParentTypes['Order']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  petId?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  quantity?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  shipDate?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  status?: Resolver<Maybe<ResolversTypes['mutation_placeOrder_status']>, ParentType, ContextType>;
  complete?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export type getInventory_200_responseResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['getInventory_200_response'] = ResolversParentTypes['getInventory_200_response']> = ResolversObject<{
  additionalProperties?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface JSONScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type UserResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  username?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  firstName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lastName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  email?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  password?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  phone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  userStatus?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface AnyScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Any'], any> {
  name: 'Any';
}

export type MutationResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = ResolversObject<{
  uploadFile?: Resolver<Maybe<ResolversTypes['ApiResponse']>, ParentType, ContextType, RequireFields<MutationuploadFileArgs, 'petId'>>;
  addPet?: Resolver<Maybe<ResolversTypes['Any']>, ParentType, ContextType, RequireFields<MutationaddPetArgs, 'input'>>;
  updatePet?: Resolver<Maybe<ResolversTypes['Any']>, ParentType, ContextType, RequireFields<MutationupdatePetArgs, 'input'>>;
  updatePetWithForm?: Resolver<Maybe<ResolversTypes['Any']>, ParentType, ContextType, RequireFields<MutationupdatePetWithFormArgs, 'petId'>>;
  deletePet?: Resolver<Maybe<ResolversTypes['Any']>, ParentType, ContextType, RequireFields<MutationdeletePetArgs, 'petId'>>;
  placeOrder?: Resolver<Maybe<ResolversTypes['Order']>, ParentType, ContextType, Partial<MutationplaceOrderArgs>>;
  deleteOrder?: Resolver<Maybe<ResolversTypes['Any']>, ParentType, ContextType, RequireFields<MutationdeleteOrderArgs, 'orderId'>>;
  createUsersWithArrayInput?: Resolver<Maybe<ResolversTypes['Any']>, ParentType, ContextType, Partial<MutationcreateUsersWithArrayInputArgs>>;
  createUsersWithListInput?: Resolver<Maybe<ResolversTypes['Any']>, ParentType, ContextType, Partial<MutationcreateUsersWithListInputArgs>>;
  updateUser?: Resolver<Maybe<ResolversTypes['Any']>, ParentType, ContextType, RequireFields<MutationupdateUserArgs, 'username'>>;
  deleteUser?: Resolver<Maybe<ResolversTypes['Any']>, ParentType, ContextType, RequireFields<MutationdeleteUserArgs, 'username'>>;
  createUser?: Resolver<Maybe<ResolversTypes['Any']>, ParentType, ContextType, Partial<MutationcreateUserArgs>>;
}>;

export type ApiResponseResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['ApiResponse'] = ResolversParentTypes['ApiResponse']> = ResolversObject<{
  code?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resolvers<ContextType = MeshContext> = ResolversObject<{
  Query?: QueryResolvers<ContextType>;
  Pet?: PetResolvers<ContextType>;
  BigInt?: GraphQLScalarType;
  Category?: CategoryResolvers<ContextType>;
  Tag?: TagResolvers<ContextType>;
  Order?: OrderResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  getInventory_200_response?: getInventory_200_responseResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  User?: UserResolvers<ContextType>;
  Any?: GraphQLScalarType;
  Mutation?: MutationResolvers<ContextType>;
  ApiResponse?: ApiResponseResolvers<ContextType>;
}>;


import { MeshContext as BaseMeshContext, MeshInstance } from '@graphql-mesh/runtime';

import { InContextSdkMethod } from '@graphql-mesh/types';


    export namespace PetStoreTypes {
      export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  /** The `String` scalar type represents textual data, represented as UTF-8 character sequences. The String type is most often used by GraphQL to represent free-form human-readable text. */
  String: string;
  /** The `Boolean` scalar type represents `true` or `false`. */
  Boolean: boolean;
  /** The `Int` scalar type represents non-fractional signed whole numeric values. Int can represent values between -(2^31) and 2^31 - 1. */
  Int: number;
  Float: number;
  /** The `BigInt` scalar type represents non-fractional signed whole numeric values. */
  BigInt: bigint;
  /** A date-time string at UTC, such as 2007-12-03T10:15:30Z, compliant with the `date-time` format outlined in section 5.6 of the RFC 3339 profile of the ISO 8601 standard for representation of dates and times using the Gregorian calendar. */
  DateTime: Date | string;
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSON: any;
  Any: any;
};

export type Query = {
  /** Multiple status values can be provided with comma separated strings */
  findPetsByStatus?: Maybe<Array<Maybe<Pet>>>;
  /** Multiple tags can be provided with comma separated strings. Use tag1, tag2, tag3 for testing. */
  findPetsByTags?: Maybe<Array<Maybe<Pet>>>;
  /** Returns a single pet */
  getPetById?: Maybe<Pet>;
  /** For valid response try integer IDs with value >= 1 and <= 10. Other values will generated exceptions */
  getOrderById?: Maybe<Order>;
  /** Returns a map of status codes to quantities */
  getInventory?: Maybe<getInventory_200_response>;
  /** Get user by user name */
  getUserByName?: Maybe<User>;
  /** Logs user into the system */
  loginUser?: Maybe<Scalars['String']>;
  /** Logs out current logged in user session */
  logoutUser?: Maybe<Scalars['Any']>;
};


export type QueryfindPetsByStatusArgs = {
  input: findPetsByStatus_request_Input;
};


export type QueryfindPetsByTagsArgs = {
  input: findPetsByTags_request_Input;
};


export type QuerygetPetByIdArgs = {
  petId: Scalars['Int'];
};


export type QuerygetOrderByIdArgs = {
  orderId: Scalars['Int'];
};


export type QuerygetUserByNameArgs = {
  username: Scalars['String'];
};


export type QueryloginUserArgs = {
  input: loginUser_request_Input;
};

export type Pet = {
  id?: Maybe<Scalars['BigInt']>;
  category?: Maybe<Category>;
  name: Scalars['String'];
  photoUrls: Array<Maybe<Scalars['String']>>;
  tags?: Maybe<Array<Maybe<Tag>>>;
  status?: Maybe<mutationInput_addPet_status>;
};

export type Category = {
  id?: Maybe<Scalars['BigInt']>;
  name?: Maybe<Scalars['String']>;
};

export type Tag = {
  id?: Maybe<Scalars['BigInt']>;
  name?: Maybe<Scalars['String']>;
};

/** pet status in the store */
export type mutationInput_addPet_status =
  | 'available'
  | 'pending'
  | 'sold';

export type findPetsByStatus_request_Input = {
  /** Status values that need to be considered for filter */
  status: Array<InputMaybe<queryInput_findPetsByStatus_status_items>>;
};

export type queryInput_findPetsByStatus_status_items =
  | 'available'
  | 'pending'
  | 'sold';

export type findPetsByTags_request_Input = {
  /** Tags to filter by */
  tags: Array<InputMaybe<Scalars['String']>>;
};

export type Order = {
  id?: Maybe<Scalars['BigInt']>;
  petId?: Maybe<Scalars['BigInt']>;
  quantity?: Maybe<Scalars['Int']>;
  shipDate?: Maybe<Scalars['DateTime']>;
  status?: Maybe<mutation_placeOrder_status>;
  complete?: Maybe<Scalars['Boolean']>;
};

/** Order Status */
export type mutation_placeOrder_status =
  | 'placed'
  | 'approved'
  | 'delivered';

export type getInventory_200_response = {
  additionalProperties?: Maybe<Scalars['JSON']>;
};

export type User = {
  id?: Maybe<Scalars['BigInt']>;
  username?: Maybe<Scalars['String']>;
  firstName?: Maybe<Scalars['String']>;
  lastName?: Maybe<Scalars['String']>;
  email?: Maybe<Scalars['String']>;
  password?: Maybe<Scalars['String']>;
  phone?: Maybe<Scalars['String']>;
  /** User Status */
  userStatus?: Maybe<Scalars['Int']>;
};

export type loginUser_request_Input = {
  /** The user name for login */
  username: Scalars['String'];
  /** The password for login in clear text */
  password: Scalars['String'];
};

export type Mutation = {
  /** uploads an image */
  uploadFile?: Maybe<ApiResponse>;
  /** Add a new pet to the store */
  addPet?: Maybe<Scalars['Any']>;
  /** Update an existing pet */
  updatePet?: Maybe<Scalars['Any']>;
  /** Updates a pet in the store with form data */
  updatePetWithForm?: Maybe<Scalars['Any']>;
  /** Deletes a pet */
  deletePet?: Maybe<Scalars['Any']>;
  /** Place an order for a pet */
  placeOrder?: Maybe<Order>;
  /** For valid response try integer IDs with positive integer value. Negative or non-integer values will generate API errors */
  deleteOrder?: Maybe<Scalars['Any']>;
  /** Creates list of users with given input array */
  createUsersWithArrayInput?: Maybe<Scalars['Any']>;
  /** Creates list of users with given input array */
  createUsersWithListInput?: Maybe<Scalars['Any']>;
  /** This can only be done by the logged in user. */
  updateUser?: Maybe<Scalars['Any']>;
  /** This can only be done by the logged in user. */
  deleteUser?: Maybe<Scalars['Any']>;
  /** This can only be done by the logged in user. */
  createUser?: Maybe<Scalars['Any']>;
};


export type MutationuploadFileArgs = {
  petId: Scalars['Int'];
};


export type MutationaddPetArgs = {
  input: Pet_Input;
};


export type MutationupdatePetArgs = {
  input: Pet_Input;
};


export type MutationupdatePetWithFormArgs = {
  petId: Scalars['Int'];
};


export type MutationdeletePetArgs = {
  api_key?: InputMaybe<Scalars['String']>;
  petId: Scalars['Int'];
};


export type MutationplaceOrderArgs = {
  input?: InputMaybe<Order_Input>;
};


export type MutationdeleteOrderArgs = {
  orderId: Scalars['Int'];
};


export type MutationcreateUsersWithArrayInputArgs = {
  input?: InputMaybe<Array<InputMaybe<User_Input>>>;
};


export type MutationcreateUsersWithListInputArgs = {
  input?: InputMaybe<Array<InputMaybe<User_Input>>>;
};


export type MutationupdateUserArgs = {
  input?: InputMaybe<User_Input>;
  username: Scalars['String'];
};


export type MutationdeleteUserArgs = {
  username: Scalars['String'];
};


export type MutationcreateUserArgs = {
  input?: InputMaybe<User_Input>;
};

export type ApiResponse = {
  code?: Maybe<Scalars['Int']>;
  type?: Maybe<Scalars['String']>;
  message?: Maybe<Scalars['String']>;
};

export type Pet_Input = {
  id?: InputMaybe<Scalars['BigInt']>;
  category?: InputMaybe<Category_Input>;
  name: Scalars['String'];
  photoUrls: Array<InputMaybe<Scalars['String']>>;
  tags?: InputMaybe<Array<InputMaybe<Tag_Input>>>;
  status?: InputMaybe<mutationInput_addPet_status>;
};

export type Category_Input = {
  id?: InputMaybe<Scalars['BigInt']>;
  name?: InputMaybe<Scalars['String']>;
};

export type Tag_Input = {
  id?: InputMaybe<Scalars['BigInt']>;
  name?: InputMaybe<Scalars['String']>;
};

export type Order_Input = {
  id?: InputMaybe<Scalars['BigInt']>;
  petId?: InputMaybe<Scalars['BigInt']>;
  quantity?: InputMaybe<Scalars['Int']>;
  shipDate?: InputMaybe<Scalars['DateTime']>;
  status?: InputMaybe<mutation_placeOrder_status>;
  complete?: InputMaybe<Scalars['Boolean']>;
};

export type User_Input = {
  id?: InputMaybe<Scalars['BigInt']>;
  username?: InputMaybe<Scalars['String']>;
  firstName?: InputMaybe<Scalars['String']>;
  lastName?: InputMaybe<Scalars['String']>;
  email?: InputMaybe<Scalars['String']>;
  password?: InputMaybe<Scalars['String']>;
  phone?: InputMaybe<Scalars['String']>;
  /** User Status */
  userStatus?: InputMaybe<Scalars['Int']>;
};

    }
    export type QueryPetStoreSdk = {
  /** Multiple status values can be provided with comma separated strings **/
  findPetsByStatus: InContextSdkMethod<PetStoreTypes.Query['findPetsByStatus'], PetStoreTypes.QueryfindPetsByStatusArgs, MeshContext>,
  /** Multiple tags can be provided with comma separated strings. Use tag1, tag2, tag3 for testing. **/
  findPetsByTags: InContextSdkMethod<PetStoreTypes.Query['findPetsByTags'], PetStoreTypes.QueryfindPetsByTagsArgs, MeshContext>,
  /** Returns a single pet **/
  getPetById: InContextSdkMethod<PetStoreTypes.Query['getPetById'], PetStoreTypes.QuerygetPetByIdArgs, MeshContext>,
  /** For valid response try integer IDs with value >= 1 and <= 10. Other values will generated exceptions **/
  getOrderById: InContextSdkMethod<PetStoreTypes.Query['getOrderById'], PetStoreTypes.QuerygetOrderByIdArgs, MeshContext>,
  /** Returns a map of status codes to quantities **/
  getInventory: InContextSdkMethod<PetStoreTypes.Query['getInventory'], {}, MeshContext>,
  /** Get user by user name **/
  getUserByName: InContextSdkMethod<PetStoreTypes.Query['getUserByName'], PetStoreTypes.QuerygetUserByNameArgs, MeshContext>,
  /** Logs user into the system **/
  loginUser: InContextSdkMethod<PetStoreTypes.Query['loginUser'], PetStoreTypes.QueryloginUserArgs, MeshContext>,
  /** Logs out current logged in user session **/
  logoutUser: InContextSdkMethod<PetStoreTypes.Query['logoutUser'], {}, MeshContext>
};

export type MutationPetStoreSdk = {
  /** uploads an image **/
  uploadFile: InContextSdkMethod<PetStoreTypes.Mutation['uploadFile'], PetStoreTypes.MutationuploadFileArgs, MeshContext>,
  /** Add a new pet to the store **/
  addPet: InContextSdkMethod<PetStoreTypes.Mutation['addPet'], PetStoreTypes.MutationaddPetArgs, MeshContext>,
  /** Update an existing pet **/
  updatePet: InContextSdkMethod<PetStoreTypes.Mutation['updatePet'], PetStoreTypes.MutationupdatePetArgs, MeshContext>,
  /** Updates a pet in the store with form data **/
  updatePetWithForm: InContextSdkMethod<PetStoreTypes.Mutation['updatePetWithForm'], PetStoreTypes.MutationupdatePetWithFormArgs, MeshContext>,
  /** Deletes a pet **/
  deletePet: InContextSdkMethod<PetStoreTypes.Mutation['deletePet'], PetStoreTypes.MutationdeletePetArgs, MeshContext>,
  /** Place an order for a pet **/
  placeOrder: InContextSdkMethod<PetStoreTypes.Mutation['placeOrder'], PetStoreTypes.MutationplaceOrderArgs, MeshContext>,
  /** For valid response try integer IDs with positive integer value. Negative or non-integer values will generate API errors **/
  deleteOrder: InContextSdkMethod<PetStoreTypes.Mutation['deleteOrder'], PetStoreTypes.MutationdeleteOrderArgs, MeshContext>,
  /** Creates list of users with given input array **/
  createUsersWithArrayInput: InContextSdkMethod<PetStoreTypes.Mutation['createUsersWithArrayInput'], PetStoreTypes.MutationcreateUsersWithArrayInputArgs, MeshContext>,
  /** Creates list of users with given input array **/
  createUsersWithListInput: InContextSdkMethod<PetStoreTypes.Mutation['createUsersWithListInput'], PetStoreTypes.MutationcreateUsersWithListInputArgs, MeshContext>,
  /** This can only be done by the logged in user. **/
  updateUser: InContextSdkMethod<PetStoreTypes.Mutation['updateUser'], PetStoreTypes.MutationupdateUserArgs, MeshContext>,
  /** This can only be done by the logged in user. **/
  deleteUser: InContextSdkMethod<PetStoreTypes.Mutation['deleteUser'], PetStoreTypes.MutationdeleteUserArgs, MeshContext>,
  /** This can only be done by the logged in user. **/
  createUser: InContextSdkMethod<PetStoreTypes.Mutation['createUser'], PetStoreTypes.MutationcreateUserArgs, MeshContext>
};

export type SubscriptionPetStoreSdk = {

};

export type PetStoreContext = {
      ["PetStore"]: { Query: QueryPetStoreSdk, Mutation: MutationPetStoreSdk, Subscription: SubscriptionPetStoreSdk },
    };

export type MeshContext = PetStoreContext & BaseMeshContext;


import { getMesh } from '@graphql-mesh/runtime';
import { MeshStore, FsStoreStorageAdapter } from '@graphql-mesh/store';
import { path as pathModule } from '@graphql-mesh/cross-helpers';
import { fileURLToPath } from '@graphql-mesh/utils';
import * as ExternalModule_0 from '@graphql-mesh/cache-inmemory-lru';
import * as ExternalModule_1 from '@graphql-mesh/new-openapi';
import * as ExternalModule_2 from '@graphql-mesh/merger-bare';
import * as ExternalModule_3 from './sources/PetStore/jsonSchemaBundle';

const importedModules: Record<string, any> = {
  // @ts-ignore
  ["@graphql-mesh/cache-inmemory-lru"]: ExternalModule_0,
  // @ts-ignore
  ["@graphql-mesh/new-openapi"]: ExternalModule_1,
  // @ts-ignore
  ["@graphql-mesh/merger-bare"]: ExternalModule_2,
  // @ts-ignore
  [".mesh/sources/PetStore/jsonSchemaBundle"]: ExternalModule_3
};

const baseDir = pathModule.join(pathModule.dirname(fileURLToPath(import.meta.url)), '..');

const importFn = (moduleId: string) => {
  const relativeModuleId = (pathModule.isAbsolute(moduleId) ? pathModule.relative(baseDir, moduleId) : moduleId).split('\\').join('/').replace(baseDir + '/', '');
  if (!(relativeModuleId in importedModules)) {
    throw new Error(`Cannot find module '${relativeModuleId}'.`);
  }
  return Promise.resolve(importedModules[relativeModuleId]);
};

const rootStore = new MeshStore('.mesh', new FsStoreStorageAdapter({
  cwd: baseDir,
  importFn,
  fileType: 'ts',
}), {
  readonly: true,
  validate: false
});

import { GetMeshOptions } from '@graphql-mesh/runtime';
import { YamlConfig } from '@graphql-mesh/types';
import { parse } from 'graphql';
import { PubSub } from '@graphql-mesh/utils';
import MeshCache from '@graphql-mesh/cache-inmemory-lru';
import { DefaultLogger } from '@graphql-mesh/utils';
import NewOpenapiHandler from '@graphql-mesh/new-openapi'
import BareMerger from '@graphql-mesh/merger-bare';
import { resolveAdditionalResolvers } from '@graphql-mesh/utils';
import { parseWithCache } from '@graphql-mesh/utils';
export const rawConfig: YamlConfig.Config = {"sources":[{"name":"PetStore","handler":{"newOpenapi":{"baseUrl":"https://petstore.swagger.io/v2/","oasFilePath":"https://petstore.swagger.io/v2/swagger.json"}}}]} as any
export async function getMeshOptions(): Promise<GetMeshOptions> {
const pubsub = new PubSub();
const cache = new (MeshCache as any)({
      ...(rawConfig.cache || {}),
      importFn,
      store: rootStore.child('cache'),
      pubsub,
    } as any)
const sourcesStore = rootStore.child('sources');
const logger = new DefaultLogger('🕸️  Mesh');
const sources = [];
const transforms = [];
const petStoreTransforms = [];
const additionalTypeDefs = [] as any[];
const petStoreHandler = new NewOpenapiHandler({
              name: rawConfig.sources[0].name,
              config: rawConfig.sources[0].handler["newOpenapi"],
              baseDir,
              cache,
              pubsub,
              store: sourcesStore.child(rawConfig.sources[0].name),
              logger: logger.child(rawConfig.sources[0].name),
              importFn
            });
sources.push({
          name: 'PetStore',
          handler: petStoreHandler,
          transforms: petStoreTransforms
        })
const merger = new(BareMerger as any)({
        cache,
        pubsub,
        logger: logger.child('BareMerger'),
        store: rootStore.child('bareMerger')
      })
const additionalResolversRawConfig = [];
const additionalResolvers = await resolveAdditionalResolvers(
      baseDir,
      additionalResolversRawConfig,
      importFn,
      pubsub
  )
const liveQueryInvalidations = rawConfig.liveQueryInvalidations;
const additionalEnvelopPlugins = [];
const documents = documentsInSDL.map((documentSdl: string, i: number) => ({
              rawSDL: documentSdl,
              document: parseWithCache(documentSdl),
              location: `document_${i}.graphql`,
            }))

  return {
    sources,
    transforms,
    additionalTypeDefs,
    additionalResolvers,
    cache,
    pubsub,
    merger,
    logger,
    liveQueryInvalidations,
    additionalEnvelopPlugins,
    documents,
  };
}

export const documentsInSDL = /*#__PURE__*/ [];

export async function getBuiltMesh(): Promise<MeshInstance<MeshContext>> {
  const meshConfig = await getMeshOptions();
  return getMesh<MeshContext>(meshConfig);
}

export async function getMeshSDK<TGlobalContext = any, TOperationContext = any>(globalContext?: TGlobalContext) {
  const { sdkRequesterFactory } = await getBuiltMesh();
  return getSdk<TOperationContext>(sdkRequesterFactory(globalContext));
}

export type Requester<C= {}> = <R, V>(doc: DocumentNode, vars?: V, options?: C) => Promise<R>
export function getSdk<C>(requester: Requester<C>) {
  return {

  };
}
export type Sdk = ReturnType<typeof getSdk>;