#!/bin/bash
set -e
echo "=== Installing backend dependencies ==="
cd backend && npm install && cd ..
echo "=== Install complete ==="
