#!/bin/bash
set -e

echo "🏗️  Building Next.js app from rfq-system directory..."

cd rfq-system
npm install --legacy-peer-deps
npm run build

echo "✅ Build complete!"
