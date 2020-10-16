FROM node:14.13.1-alpine3.10

WORKDIR /home/node/app

COPY public public
COPY views views
COPY index.ts index.ts
COPY package.json package.json

RUN npm install

EXPOSE 3000

ENTRYPOINT [ "npm", "run", "start" ]