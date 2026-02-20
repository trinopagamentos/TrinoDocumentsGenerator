FROM denoland/deno:2.6.10

ARG TZ=America/Sao_Paulo
ARG NODE_ENV=production

ENV TZ=$TZ
ENV NODE_ENV=$NODE_ENV

# Dependências do Chromium no Linux
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    nodejs \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

USER deno

WORKDIR /app

COPY --chown=deno:deno src src
COPY --chown=deno:deno deno.json* .
COPY --chown=deno:deno deno.lock* .

RUN deno install

# Pre-cache de dependências
RUN deno cache src/main.ts

CMD ["task", "start"]
