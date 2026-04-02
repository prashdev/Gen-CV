#!/bin/bash
# deploy.sh — Build JAR locally and push for fast Render deployment.
# Render uses Dockerfile.deploy (single-stage, no Maven) → deploys in ~60 seconds.
#
# Usage: ./deploy.sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_NAME="cv-generator-1.0.0.jar"
JAR_SRC="$PROJECT_DIR/target/$JAR_NAME"
JAR_DEST="$PROJECT_DIR/app.jar"

cd "$PROJECT_DIR"

echo "==> Building JAR..."

if command -v mvn &>/dev/null; then
  echo "    Using local Maven..."
  mvn clean package -DskipTests -B -q
else
  echo "    Maven not found locally — building via Docker (takes ~3 min first time)..."
  docker run --rm \
    -v "$PROJECT_DIR":/workspace \
    -w /workspace \
    maven:3.9-eclipse-temurin-17 \
    mvn clean package -DskipTests -B -q
fi

if [ ! -f "$JAR_SRC" ]; then
  echo "ERROR: JAR not found at $JAR_SRC"
  exit 1
fi

echo "==> Copying JAR to project root..."
cp "$JAR_SRC" "$JAR_DEST"

echo "==> Committing and pushing..."
git add app.jar
git commit -m "deploy: pre-built JAR $(date '+%Y-%m-%d %H:%M')"
git push origin main

echo ""
echo "Done! Render will now deploy using Dockerfile.deploy (~60 seconds)."
echo "Watch progress at: https://dashboard.render.com"
