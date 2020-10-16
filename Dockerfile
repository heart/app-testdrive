FROM node:14.13.1-alpine3.10

RUN adduser -H -D -u 1001 -G ping 1001
RUN chown 755 /home/node/app
WORKDIR /home/node/app
USER 1001

COPY public public
COPY views views
COPY index.ts index.ts
COPY package.json package.json

RUN npm install

EXPOSE 3000

ENTRYPOINT [ "npm", "run", "start" ]