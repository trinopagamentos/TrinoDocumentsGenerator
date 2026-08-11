FROM denoland/deno:alpine-2.9.5

ARG TZ=America/Sao_Paulo
ARG NODE_ENV=production

ENV TZ=$TZ
ENV NODE_ENV=$NODE_ENV
ENV TINI_SUBREAPER=1

RUN mkdir -p /home/deno && chown deno:deno /home/deno

USER deno

WORKDIR /app

COPY --chown=deno:deno src src
COPY --chown=deno:deno template template
COPY --chown=deno:deno fonts fonts
COPY --chown=deno:deno deno.json* .
COPY --chown=deno:deno deno.lock* .

RUN deno install

# Pre-cache de dependências
RUN deno cache src/main.ts

CMD ["task", "start"]
