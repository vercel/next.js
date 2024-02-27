import {
  ResultOf,
  DocumentTypeDecoration,
  TypedDocumentNode,
} from "@graphql-typed-document-node/core";
import { FragmentDefinitionNode } from "graphql";
import { Incremental } from "./graphql";

export type FragmentType<
  TDocumentType extends DocumentTypeDecoration<any, any>,
> = TDocumentType extends DocumentTypeDecoration<infer TType, any>
  ? [TType] extends [{ " $fragmentName"?: infer TKey }]
    ? TKey extends string
      ? { " $fragmentRefs"?: { [key in TKey]: TType } }
      : never
    : never
  : never;

// return non-nullable if `fragmentType` is non-nullable
export function useFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType: FragmentType<DocumentTypeDecoration<TType, any>>,
): TType;
// return nullable if `fragmentType` is nullable
export function useFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType:
    | FragmentType<DocumentTypeDecoration<TType, any>>
    | null
    | undefined,
): TType | null | undefined;
// return array of non-nullable if `fragmentType` is array of non-nullable
export function useFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType: ReadonlyArray<FragmentType<DocumentTypeDecoration<TType, any>>>,
): ReadonlyArray<TType>;
// return array of nullable if `fragmentType` is array of nullable
export function useFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType:
    | ReadonlyArray<FragmentType<DocumentTypeDecoration<TType, any>>>
    | null
    | undefined,
): ReadonlyArray<TType> | null | undefined;
export function useFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType:
    | FragmentType<DocumentTypeDecoration<TType, any>>
    | ReadonlyArray<FragmentType<DocumentTypeDecoration<TType, any>>>
    | null
    | undefined,
): TType | ReadonlyArray<TType> | null | undefined {
  return fragmentType as any;
}

export function makeFragmentData<
  F extends DocumentTypeDecoration<any, any>,
  FT extends ResultOf<F>,
>(data: FT, _fragment: F): FragmentType<F> {
  return data as FragmentType<F>;
}
export function isFragmentReady<TQuery, TFrag>(
  queryNode: DocumentTypeDecoration<TQuery, any>,
  fragmentNode: TypedDocumentNode<TFrag>,
  data:
    | FragmentType<TypedDocumentNode<Incremental<TFrag>, any>>
    | null
    | undefined,
): data is FragmentType<typeof fragmentNode> {
  const deferredFields = (
    queryNode as {
      __meta__?: { deferredFields: Record<string, (keyof TFrag)[]> };
    }
  ).__meta__?.deferredFields;

  if (!deferredFields) return true;

  const fragDef = fragmentNode.definitions[0] as
    | FragmentDefinitionNode
    | undefined;
  const fragName = fragDef?.name?.value;

  const fields = (fragName && deferredFields[fragName]) || [];
  return fields.length > 0 && fields.every((field) => data && field in data);
}
