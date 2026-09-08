FROM rust:1.86-bookworm AS build
WORKDIR /build
COPY ai-protocol/Cargo.toml ai-protocol/Cargo.toml
COPY ai-protocol/src ai-protocol/src
COPY server/Cargo.toml server/Cargo.lock server/
COPY server/src server/src
RUN cargo build --locked --release --manifest-path server/Cargo.toml

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 wangai \
    && mkdir /data && chown wangai /data
COPY --from=build /build/server/target/release/wangai-server /usr/local/bin/wangai-server
USER wangai
WORKDIR /data
ENV BIND_ADDRESS=0.0.0.0:8080 DATABASE_PATH=/data/usage.sqlite3
EXPOSE 8080
ENTRYPOINT ["wangai-server"]
