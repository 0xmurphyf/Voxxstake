#!/bin/bash
set -e

echo "=== Installing backend dependencies ==="
cd backend && npm install && cd ..

echo "=== Installing frontend dependencies ==="
cd frontend && NODE_ENV=development npm install && cd ..

echo "=== Building frontend ==="
cd frontend && npx craco build && cd ..

echo "=== Build complete ==="
