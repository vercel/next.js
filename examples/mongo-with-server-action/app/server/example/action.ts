'use server';

import type { IExample } from 'app/server/example/interfaces';

export async function getExample() {
  // const data = await getExample() <- this is where you would call your service
  const data: IExample = {
    title: 'hello world!',
    description: 'This is an example route.',
  };

  return data;
}
