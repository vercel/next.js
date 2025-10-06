import type { PropsWithChildren } from 'react';


export default async function Page(
  props: PropsWithChildren<{
    params: {
      projectId: string;
      collectionId: string;
    };
  }>
) {
  callback(() => {
    foo({
      projectId: props.params.projectId,
    });
  })
}