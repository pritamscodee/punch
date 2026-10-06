# PUNCH keeper: small static-ish image. Build context is this folder.
# Build and runtime must share a Debian release, or the binary needs a newer glibc than the runtime has.
FROM rust:1.93-slim-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/keeper /usr/local/bin/keeper
ENV PORT=8787
EXPOSE 8787
USER nobody
CMD ["keeper", "serve"]
