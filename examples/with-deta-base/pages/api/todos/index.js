// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { Deta } from 'deta';

const deta = Deta(process.env.DETA_PROJECT_KEY);

const base = deta.Base('todos');

export default async (req, res) => {

  let { body, method } = req;
  let respBody = {};

  if (method === 'GET') {

    const {value: items} = await base.fetch([]).next();
    respBody = items;
    res.statusCode = 200;

  } else if (method === 'POST') {

    body = JSON.parse(body);
    body.isCompleted = false;
    respBody = await base.put(body);
    res.statusCode = 201;

  } 

  res.json(respBody);
}
