# Build from packages/engine:
#   docker build -t cratedig-engine .
# From repo root:
#   docker build -t cratedig-engine -f packages/engine/Dockerfile packages/engine
#
# Run:
#   docker run --rm --env-file .env cratedig-engine analyze-run --analysis-run-id <uuid>
# Cloud Run Jobs can also set ANALYSIS_RUN_ID instead of the flag.

FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml README.md ./
COPY cratedig_engine ./cratedig_engine

RUN pip install --no-cache-dir -e ".[job]"

ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["cratedig-engine"]
CMD ["analyze-run"]
