#!/bin/bash
# Build and deploy SpoolBuddy
# Usage: ./scripts/deploy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building frontend..."
cd "$PROJECT_DIR/frontend"
npm run build

echo "Restarting service..."
sudo systemctl restart spoolbuddy.service

echo "Done! Checking status..."
sudo systemctl status spoolbuddy.service --no-pager | head -10
