import type { PropsWithChildren } from 'react';


export default async function Page(
  props: PropsWithChildren<{
    params: Promise<{
      projectId: string;
      collectionId: string;
    }>;
  }>
) {
  callback(() => {
    foo({
      projectId: /* @next-codemod-error 'props.params' is accessed without awaiting.*/
      props.params.projectId,
    });
  })
}