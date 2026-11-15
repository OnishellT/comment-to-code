#!/usr/bin/env node
import { main } from '../src/cli.js';

try {
  await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`comment-to-code: ${error.message}\n`);
  process.exitCode = 1;
}
