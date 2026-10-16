# Call of Karen: HOA Warfare - online multiplayer server.
# Only the server, the simulation it imports, and the data files are needed (~0.6 MB), no game art or audio.
#   docker build -t hoa-online .
#   docker run -p 8080:8080 -e HOA_DEMO=1 hoa-online
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY web/src ./web/src
COPY data ./data
ENV NODE_ENV=production PORT=8080 HOA_DEMO=1 HOA_TRUST_PROXY=1
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/multiplayer.mjs"]
