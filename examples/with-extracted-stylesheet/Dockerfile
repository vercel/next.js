FROM sheerun/critical:1.1.0

WORKDIR /app

ADD *.json /app/

RUN yarn

RUN yarn add critical@1.1.0 --offline

ADD . /app/

ENV NODE_ENV=production

RUN yarn build

EXPOSE 3000

CMD ["node", "bin/start"]
