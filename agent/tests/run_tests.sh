#!/usr/bin/env bash
# Run all agent integration tests via pytest + Doppler secrets.
#
# Usage:
#   bash tests/run_tests.sh           # from agent/
#   bash agent/tests/run_tests.sh     # from repo root

set -euo pipefail

cd "$(dirname "$0")/.."  # always run from agent/

exec doppler run -- python -m pytest tests/ -v "$@"
