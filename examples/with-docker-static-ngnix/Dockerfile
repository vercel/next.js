FROM node:latest as builder

WORKDIR /app
# install deps
COPY package.json yarn.lock ./
RUN yarn --production --frozen-lockfile

#copy the directory after install is done


COPY . .

#export
RUN yarn next build && yarn next export

#stage2 
FROM nginx:alpine

COPY nginx /etc/nginx/

# ## Remove default nginx index page 
RUN rm -rf /usr/share/nginx/html/*

# # Copy static files from the builder
COPY --from=builder /app/out /usr/share/nginx/html

ENTRYPOINT ["nginx", "-g", "daemon off;"]