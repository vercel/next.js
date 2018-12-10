/*  eslint-disable import/no-unresolved,import/extensions */
import next from 'next';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import bodyParser from 'body-parser';
import { functions } from './lib/firebase';

const nextApp = next({ dev: false, conf: { distDir: 'next' } });
const handle = nextApp.getRequestHandler();

const server = express();
server.disable('x-powered-by');
server.use(cors());
server.use(bodyParser.json());
server.set('trust proxy', 1);
server.use(compression());
server.use(helmet());

server.get('*', (req, res) => handle(req, res));

const app = functions.https.onRequest(async (req, res) => {
  await nextApp.prepare();
  return server(req, res);
});

export { app };
