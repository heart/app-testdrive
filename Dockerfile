FROM bitnami/node:14-prod

RUN adduser -H -D -u 1001 -G ping 1001
RUN chown 1001:1001 /app

WORKDIR /app

COPY public public
COPY views views
COPY index.ts index.ts
COPY package.json package.json
COPY package-lock.json package-lock.json

RUN chown -R 1001:1001 /app

RUN npm install
USER 1001
EXPOSE 3000

ENTRYPOINT [ "npm", "run", "start" ]