#!/bin/bash
set -e

echo "=== Installing backend dependencies ==="
cd backend && npm install && cd ..

echo "=== Installing frontend dependencies ==="
cd frontend && npm install --include=dev && cd ..

echo "=== Install complete (frontend build happens on start) ==="
