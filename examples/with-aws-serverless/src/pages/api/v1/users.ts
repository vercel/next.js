import { NextApiRequest, NextApiResponse } from 'next';

const getData = (): Promise<Array<UserModel>> => new Promise((resolve) => {
  setTimeout(() => {
    resolve([
      {
        name: 'kimcoder',
        email: 'kimcoder@me.com',
        photo: 'https://avatars2.githubusercontent.com/u/2926726?s=460&u=a20c1aa215d7e59f9d61cff54eb3c158db922a57&v=4'
      },
      {
        name: 'henrycavill',
        email: '',
        photo: 'https://scontent-ssn1-1.cdninstagram.com/v/t51.2885-19/s320x320/10299788_1632819743635060_1564818683_a.jpg?_nc_ht=scontent-ssn1-1.cdninstagram.com&_nc_ohc=pF7qy8YcW2MAX8g28YN&oh=05338017fe0bd73aad99591a43e3312b&oe=5EE71688'
      },
      {
        name: 'emiliaclarkealways',
        email: '',
        photo: 'https://scontent-ssn1-1.cdninstagram.com/v/t51.2885-19/s320x320/80739902_482604602444005_2709293678446247936_n.jpg?_nc_ht=scontent-ssn1-1.cdninstagram.com&_nc_ohc=nAV3M1B1aLYAX-MtD-_&oh=afe5f45a0fad47584b8b006d4ddfc50e&oe=5EE5CCB3'
      }
    ]);
  }, 500);
});

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method?.toLowerCase() !== 'get') {
    res.status(405).send({ error: 'Method Not Allowed' });
  } else {
    const data: Array<UserModel> = await getData();
    res.send({ data, error: '' });
  }
};
