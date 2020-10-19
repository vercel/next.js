FROM node:10-buster

LABEL com.github.actions.name="Next.js PR Stats"
LABEL com.github.actions.description="Compares stats of a PR with the main branch"
LABEL repository="https://github.com/zeit/next-stats-action"

COPY . /next-stats

# Install node_modules
RUN cd /next-stats && yarn install --production

RUN git config --global user.email 'stats@localhost'
RUN git config --global user.name 'next stats'

RUN apt update
RUN apt install apache2-utils -y

COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
