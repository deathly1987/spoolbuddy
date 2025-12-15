#!/bin/bash

set -e

echo "=== Running Backend Tests ==="
sudo docker compose -f docker-compose.test.yml build backend-tests
sudo docker compose -f docker-compose.test.yml run --rm backend-tests

echo "=== Running Frontend Tests ==="
sudo docker compose -f docker-compose.test.yml build frontend-tests
sudo docker compose -f docker-compose.test.yml run --rm frontend-tests

echo "=== Cleaning up ==="
sudo docker compose -f docker-compose.test.yml down --rmi all --volumes --remove-orphans

echo "=== All tests completed ==="
