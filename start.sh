#!/bin/bash
set -e

echo "=== Starting Voxxstake ==="

# If frontend not built, build it now
if [ ! -f frontend/build/index.html ]; then
  echo "=== Frontend not built, building now ==="
  cd frontend
  rm -rf node_modules
  npm install
  npx craco build
  cd ..
  echo "=== Frontend build complete ==="
fi

echo "=== Starting backend ==="
cd backend && npx tsx src/index.ts
