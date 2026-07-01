#!/bin/bash
set -e
echo "=== Starting Voxxstake ==="
cd backend && npx tsx src/index.ts
