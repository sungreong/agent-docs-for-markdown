#!/bin/bash
# Skills now live in shared/ only. Agent-specific folders are created at install time.

SOURCE="$(dirname "$0")/shared"

if [ ! -d "$SOURCE/skills" ]; then
  echo "Missing shared skills source: $SOURCE/skills" >&2
  exit 1
fi

echo "Shared skills source is ready: $SOURCE/skills"
