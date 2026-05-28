FROM denoland/deno:alpine-2.8.1

ARG TZ=America/Sao_Paulo
ARG NODE_ENV=production

ENV TZ=$TZ
ENV NODE_ENV=$NODE_ENV
ENV TINI_SUBREAPER=1

USER deno

WORKDIR /app

COPY --chown=deno:deno src src
COPY --chown=deno:deno template template
COPY --chown=deno:deno deno.json* .
COPY --chown=deno:deno deno.lock* .

RUN deno install

# Pre-cache de dependências
RUN deno cache src/main.ts

# Vendor deps para resolver WASM offline (import.meta.url vira file://)
RUN deno vendor src/main.ts

CMD ["task", "start"]
