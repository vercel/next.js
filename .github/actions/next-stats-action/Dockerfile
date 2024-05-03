FROM ubuntu:22.04

LABEL com.github.actions.name="Next.js PR Stats"
LABEL com.github.actions.description="Compares stats of a PR with the main branch"
LABEL repository="https://github.com/vercel/next-stats-action"

RUN apt update && apt upgrade -y
RUN apt install unzip wget curl nano htop screen build-essential pkg-config libssl-dev git build-essential zlib1g-dev libncurses5-dev libgdbm-dev libnss3-dev libreadline-dev libffi-dev python3 moreutils jq iproute2 openssh-server sudo whois dnsutils apache2-utils -y

RUN ln $(which python3) /usr/bin/python

RUN curl -sfLS https://install-node.vercel.app/v18.17.0 | bash -s -- -f
RUN corepack enable

WORKDIR /next-stats

# Install node_modules
COPY package.json ./
RUN pnpm install --production

# caching optimization
COPY . .

RUN git config --global user.email 'stats@localhost' && \
    git config --global user.name 'next stats'

COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
