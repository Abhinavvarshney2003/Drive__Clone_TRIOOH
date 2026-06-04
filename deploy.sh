#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Define directories
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_DIR="$PROJECT_ROOT"
DIST_PACKAGE_DIR="$PROJECT_ROOT/dist_package"
ZIP_FILE="$PROJECT_ROOT/deploy.zip"

echo "=========================================="
echo "📦 Starting production package generation"
echo "=========================================="

# 1. Build frontend
echo "🎨 Step 1: Building frontend..."
cd "$FRONTEND_DIR"
npm install

# Temporarily rename .env.local so it doesn't override production .env variables
if [ -f ".env.local" ]; then
  mv .env.local .env.local.bak
fi

npm run build

if [ -f ".env.local.bak" ]; then
  mv .env.local.bak .env.local
fi

# 2. Clean up old packages
echo "🧹 Step 2: Cleaning up previous build artifacts..."
rm -rf "$DIST_PACKAGE_DIR"
rm -f "$ZIP_FILE"
mkdir -p "$DIST_PACKAGE_DIR"

# 3. Copy backend files
echo "📂 Step 3: Copying backend files..."
cd "$PROJECT_ROOT"

# Copy main files
cp "$BACKEND_DIR/package.json" "$DIST_PACKAGE_DIR/"
cp "$BACKEND_DIR/server.js" "$DIST_PACKAGE_DIR/"
cp "$BACKEND_DIR/db.js" "$DIST_PACKAGE_DIR/"
cp "$BACKEND_DIR/.env.example" "$DIST_PACKAGE_DIR/"

# Copy optional JS files and directories if they exist
if [ -f "$BACKEND_DIR/auth.js" ]; then
  cp "$BACKEND_DIR/auth.js" "$DIST_PACKAGE_DIR/"
fi

if [ -d "$BACKEND_DIR/routes" ]; then
  cp -R "$BACKEND_DIR/routes" "$DIST_PACKAGE_DIR/"
fi

if [ -d "$BACKEND_DIR/middleware" ]; then
  cp -R "$BACKEND_DIR/middleware" "$DIST_PACKAGE_DIR/"
fi

# 4. Copy frontend distribution files
echo "📂 Step 4: Copying frontend build artifacts..."
cp -R "$FRONTEND_DIR/dist" "$DIST_PACKAGE_DIR/frontend"

# 5. Zip the production package
echo "🤐 Step 5: Archiving into $ZIP_FILE..."
cd "$DIST_PACKAGE_DIR"
zip -r "$ZIP_FILE" . -x "*.DS_Store*"

# 6. Clean up temporary directory
echo "🧹 Step 6: Cleaning up..."
rm -rf "$DIST_PACKAGE_DIR"

echo "=========================================="
echo "✅ Production package created successfully: deploy.zip"
echo "=========================================="
