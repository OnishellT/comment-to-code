#!/bin/sh
set -eu
package_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
command -v node >/dev/null 2>&1 || { echo 'Node.js >=22 is required' >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' || { echo 'Node.js >=22 is required' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo 'npm is required' >&2; exit 1; }
npm install --global --ignore-scripts "$package_dir"
printf '%s\n' 'Installed comment-to-code. In a GitHub checkout: comment-to-code install --agent all'
