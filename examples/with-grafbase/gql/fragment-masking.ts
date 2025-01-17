import { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";

export type FragmentType<TDocumentType extends DocumentNode<any, any>> =
  TDocumentType extends DocumentNode<infer TType, any>
    ? TType extends { " $fragmentName"?: infer TKey }
      ? TKey extends string
        ? { " $fragmentRefs"?: { [key in TKey]: TType } }
        : never
      : never
    : never;

// return non-nullable if `fragmentType` is non-nullable
export function useFragment<TType>(
  _documentNode: DocumentNode<TType, any>,
  fragmentType: FragmentType<DocumentNode<TType, any>>,
): TType;
// return nullable if `fragmentType` is nullable
export function useFragment<TType>(
  _documentNode: DocumentNode<TType, any>,
  fragmentType: FragmentType<DocumentNode<TType, any>> | null | undefined,
): TType | null | undefined;
// return array of non-nullable if `fragmentType` is array of non-nullable
export function useFragment<TType>(
  _documentNode: DocumentNode<TType, any>,
  fragmentType: ReadonlyArray<FragmentType<DocumentNode<TType, any>>>,
): ReadonlyArray<TType>;
// return array of nullable if `fragmentType` is array of nullable
export function useFragment<TType>(
  _documentNode: DocumentNode<TType, any>,
  fragmentType:
    | ReadonlyArray<FragmentType<DocumentNode<TType, any>>>
    | null
    | undefined,
): ReadonlyArray<TType> | null | undefined;
export function useFragment<TType>(
  _documentNode: DocumentNode<TType, any>,
  fragmentType:
    | FragmentType<DocumentNode<TType, any>>
    | ReadonlyArray<FragmentType<DocumentNode<TType, any>>>
    | null
    | undefined,
): TType | ReadonlyArray<TType> | null | undefined {
  return fragmentType as any;
}
