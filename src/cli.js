import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { captureProject, identifyProject } from './capture.js';
import { analyzeCapture } from './analyze.js';
import { publishRules } from './publish.js';
import { runAgentPrompt } from './agent.js';
import { AGENTS, atomicWrite, installSkills, safePath } from './install.js';

const exec = promisify(execFile);
const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const help = `comment-to-code ${packageInfo.version}
Learn preventive rules from GitHub PR history (no hooks or runtime enforcement).

Usage:
  comment-to-code install [--agent omp|claude|codex|all]
  comment-to-code capture
  comment-to-code analyze --agent omp|claude|codex [--model NAME] [--max-input-bytes N]
  comment-to-code run --agent omp|claude|codex [--model NAME] [--max-input-bytes N]
  comment-to-code --help
  comment-to-code --version

Capture includes ALL accessible PR history. Analyze sends evidence to your chosen
model provider and may incur substantial costs. Review generated rules before use.
`;

function parseArguments(argv) {
  if (!argv.length || (argv.length === 1 && ['help', '--help', '-h'].includes(argv[0]))) return { command: 'help' };
  if (argv.length === 1 && ['version', '--version', '-v'].includes(argv[0])) return { command: 'version' };
  const [command, ...rest] = argv;
  if (!['install', 'capture', 'analyze', 'run'].includes(command)) throw new Error(`Unknown command: ${command}. Use --help.`);
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const allowed = command === 'install' ? ['--agent'] : command === 'capture' ? [] : ['--agent', '--model', '--max-input-bytes'];
    if (!allowed.includes(flag) || Object.hasOwn(options, flag)) throw new Error(`Unknown or repeated option: ${flag}`);
    const value = rest[index + 1];
    if (!value || value.startsWith('-')) throw new Error(`Missing value for ${flag}`);
    options[flag] = value;
  }
  const agent = options['--agent'] ?? (command === 'install' ? 'all' : undefined);
  if (agent !== undefined && !AGENTS.includes(agent) && !(command === 'install' && agent === 'all')) throw new Error('Agent must be omp, claude, or codex (install also accepts all)');
  if (['analyze', 'run'].includes(command) && !agent) throw new Error(`${command} requires --agent omp|claude|codex`);
  const bound = options['--max-input-bytes'];
  if (bound !== undefined && (!/^[1-9]\d*$/.test(bound) || !Number.isSafeInteger(Number(bound)))) throw new Error('--max-input-bytes must be a positive safe integer');
  return { command, agent, model: options['--model'], maxInputBytes: bound === undefined ? undefined : Number(bound) };
}

async function git(cwd, args) {
  try { return (await exec('git', args, { cwd, maxBuffer: 1024 * 1024 })).stdout; } catch (error) {
    throw new Error(`Git cache protection failed (${args[0]}): ${error.code}`);
  }
}

async function prepareCache(cwd) {
  const cache = join(cwd, '.comment-to-code');
  const ignore = join(cwd, '.gitignore');
  await safePath(cache, { directory: true });
  await safePath(ignore);
  if ((await git(cwd, ['ls-files', '--', '.comment-to-code'])).trim()) throw new Error('Private .comment-to-code cache contains tracked files; untrack it before continuing');
  let content = '';
  try { content = await readFile(ignore, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!content.split(/\r?\n/).includes('/.comment-to-code/')) {
    await atomicWrite(ignore, `${content}${content && !content.endsWith('\n') ? '\n' : ''}\n# Local private PR evidence (comment-to-code)\n/.comment-to-code/\n`, { mode: 0o644 });
  }
  // Check the effective ignore rules, including any nested negations, before private writes.
  const ignored = await git(cwd, ['check-ignore', '--no-index', '--', '.comment-to-code/capture.json', '.comment-to-code/analysis.json']);
  if (ignored.trim().split(/\r?\n/).length !== 2) throw new Error('Cannot safely ignore private capture and analysis files');
  await mkdir(cache, { recursive: true, mode: 0o700 });
  await safePath(cache, { directory: true, absent: false });
  await chmod(cache, 0o700);
  return cache;
}

async function readJSON(path, { optional = false } = {}) {
  await safePath(path);
  let text;
  try { text = await readFile(path, 'utf8'); } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    if (error.code === 'ENOENT') throw new Error('No capture found. Run comment-to-code capture first.');
    throw error;
  }
  try { return JSON.parse(text); } catch { throw new Error(`Malformed JSON cache: ${path}; recapture before analyzing`); }
}

function sameRepository(actual, expected) {
  return actual && ['owner', 'name', 'host', 'url'].every(key => typeof actual[key] === 'string' && actual[key].toLowerCase() === expected[key].toLowerCase());
}

function validateCapture(capture, repository) {
  if (!capture || capture.version !== 1 || !sameRepository(capture.repository, repository) || !Array.isArray(capture.pullRequests)) throw new Error('Capture is malformed, outdated, or belongs to another repository; run capture again');
  const timestamp = Date.parse(capture.capturedAt);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 300000 || Date.now() - timestamp > 30 * 86400000) throw new Error('Capture is stale or has an invalid capture date (maximum age: 30 days); run capture again');
  for (const pr of capture.pullRequests) {
    if (!pr || !Number.isSafeInteger(pr.number) || pr.number < 1 || !Array.isArray(pr.comments) || !Array.isArray(pr.commits) || !Array.isArray(pr.files) || !Array.isArray(pr.sources) || !Array.isArray(pr.limitations)) throw new Error('Malformed PR capture; run capture again');
  }
}

export async function main(argv = process.argv.slice(2), { cwd = process.cwd(), stdout = process.stdout, capture = captureProject, identify = identifyProject, analyze = analyzeCapture, publish = publishRules, runAgent = runAgentPrompt } = {}) {
  const options = parseArguments(argv);
  if (options.command === 'help') { stdout.write(help); return; }
  if (options.command === 'version') { stdout.write(`${packageInfo.version}\n`); return; }
  const project = await identify({ cwd });
  const root = project.cwd;
  if (options.command === 'install') {
    await prepareCache(root);
    const result = await installSkills(root, options.agent);
    stdout.write(`Installed ${result.files.length} project-local skill(s). No hooks or config changed.\n`);
    return result;
  }
  const cache = await prepareCache(root);
  let evidence;
  if (['capture', 'run'].includes(options.command)) {
    evidence = await capture({ cwd: root });
    validateCapture(evidence, project.repository);
    await atomicWrite(join(cache, 'capture.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    stdout.write(`Captured ${evidence.pullRequests.length} pull request(s).\n`);
    if (options.command === 'capture') return evidence;
  } else {
    evidence = await readJSON(join(cache, 'capture.json'));
    validateCapture(evidence, project.repository);
  }
  const previous = await readJSON(join(cache, 'analysis.json'), { optional: true });
  if (previous && (previous.version !== 1 || !sameRepository(previous.repository, project.repository))) throw new Error('Previous analysis is outdated or belongs to another repository; remove its cache before retrying');
  const analysis = await analyze(evidence, { runAgent: prompt => runAgent(options.agent, prompt, { model: options.model }), previous, ...(options.maxInputBytes === undefined ? {} : { maxInputBytes: options.maxInputBytes }) });
  await safePath(join(cache, 'analysis.json'));
  await publish(root, analysis);
  await atomicWrite(join(cache, 'analysis.json'), `${JSON.stringify(analysis, null, 2)}\n`);
  stdout.write(`Published ${analysis.rules.length} preventive rule(s). Review rules.md before use.\n`);
  return analysis;
}
