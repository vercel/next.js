FROM ubuntu:22.04

LABEL com.github.actions.name="Next.js PR Stats"
LABEL com.github.actions.description="Compares stats of a PR with the main branch"
LABEL repository="https://github.com/vercel/next-stats-action"

COPY . /next-stats

RUN apt update && apt upgrade -y
RUN apt install unzip wget curl nano htop screen build-essential pkg-config libssl-dev git build-essential zlib1g-dev libncurses5-dev libgdbm-dev libnss3-dev libreadline-dev libffi-dev python3 moreutils jq iproute2 openssh-server sudo whois dnsutils -y

RUN ln $(which python3) /usr/bin/python

RUN curl -sfLS https://install-node.vercel.app/v18.16.1 | bash -s -- -f

# Install node_modules
RUN npm i -g pnpm@7.24.3 yarn@1.22.19
RUN cd /next-stats && pnpm install --production

RUN git config --global user.email 'stats@localhost'
RUN git config --global user.name 'next stats'

RUN apt update
RUN apt install apache2-utils -y

COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
