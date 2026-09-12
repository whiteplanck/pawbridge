FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node server/ ./server/
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=8787 DATABASE_PATH=/data/pawbridge.sqlite
EXPOSE 8787
CMD ["node", "server/index.mjs"]
