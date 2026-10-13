# Local and CI image. The AWS Lambda image (based on the official Lambda Python base image)
# comes in step 6 with the deployment.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml README.md LICENSE ./
COPY src ./src
RUN pip install . && useradd --create-home --uid 10001 app

USER app

CMD ["python", "-m", "aeromro"]
