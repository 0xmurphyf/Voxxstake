#!/bin/bash
set -e
echo "=== Installing backend dependencies ==="
cd backend && npm install --include=dev && cd ..
echo "=== Building frontend ==="
cd frontend && npm install --include=dev && npm run build && cd ..
echo "=== Install complete ==="
