import { spawn } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { AGENTS } from './install.js';

const OUTPUT_LIMIT = 8 * 1024 * 1024;
const STDERR_LIMIT = 64 * 1024;

function execute(executable, args, input, { cwd, env, timeoutMs, privateOutput = false }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false, detached: process.platform !== 'win32' });
    const stdout = [];
    let bytes = 0;
    let stderr = '';
    let failure;
    function stop(message) {
      failure ??= new Error(message);
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch (error) { if (error.code !== 'ESRCH') failure = error; }
    }
    const timer = setTimeout(() => stop(`${executable} timed out after ${timeoutMs}ms`), timeoutMs);
    child.on('error', error => { failure = new Error(`Cannot run ${executable}: ${error.message}`); });
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > OUTPUT_LIMIT) stop(`${executable} exceeded the ${OUTPUT_LIMIT}-byte output limit`);
      else stdout.push(chunk);
    });
    child.stderr.on('data', chunk => {
      if (Buffer.byteLength(stderr) + chunk.length > STDERR_LIMIT) stop(`${executable} exceeded the stderr limit`);
      else stderr += chunk.toString();
    });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') stop(`Cannot send prompt to ${executable}: ${error.code}`); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      if (code !== 0) {
        const hint = !privateOutput && /auth|login|api.key|credential|401|403/i.test(stderr) ? '; check provider authentication' : '';
        return reject(new Error(`${executable} failed (${signal ? `signal ${signal}` : `exit ${code}`}${hint}). Run ${executable} --help and check its login/configuration; private stderr is not printed.`));
      }
      resolvePromise(Buffer.concat(stdout).toString('utf8'));
    });
    child.stdin.end(input);
  });
}

async function copyCredential(source, destination) {
  try {
    const stat = await lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Credential must be a regular file: ${source}`);
    await copyFile(source, destination);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function cleanEnvironment(home) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config'), XDG_DATA_HOME: join(home, '.local', 'share'), XDG_STATE_HOME: join(home, '.local', 'state'), XDG_CACHE_HOME: join(home, '.cache') };
  for (const key of Object.keys(env)) {
    if (/^(OMP_|PI_|CODEX_|CLAUDE_)/.test(key) || ['NODE_OPTIONS', 'BUN_OPTIONS', 'BUN_PRELOAD', 'BASH_ENV', 'ENV'].includes(key)) delete env[key];
  }
  // Explicitly supplied provider credentials/proxy settings stay available; no project dotenv is loaded.
  for (const key of ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

export async function runAgentPrompt(agent, prompt, { model, timeoutMs = 300000 } = {}) {
  if (!AGENTS.includes(agent)) throw new Error('Agent must be omp, claude, or codex');
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Agent prompt must be nonempty text');
  if (Buffer.byteLength(prompt) > 16 * 1024 * 1024) throw new Error('Agent prompt exceeds 16 MiB');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('timeoutMs must be a positive integer');
  if (model !== undefined && (typeof model !== 'string' || !model.trim() || model.startsWith('-'))) throw new Error('Model must be a nonempty model name, not an option');
  const temporary = await mkdtemp(join(tmpdir(), 'comment-to-code-agent-'));
  const startedAt = Date.now();
  try {
    const work = join(temporary, 'work');
    const home = join(temporary, 'home');
    await mkdir(work);
    await mkdir(home);
    const env = cleanEnvironment(home);
    const options = () => ({ cwd: work, env, timeoutMs: Math.max(1, timeoutMs - (Date.now() - startedAt)) });
    let args;
    let outputFile;
    if (agent === 'omp') {
      env.PI_CONFIG_DIR = '.omp';
      env.PI_CODING_AGENT_DIR = join(home, '.omp', 'agent');
      env.OMP_PROFILE = 'default';
      env.PI_NO_PTY = '1';
      // The auth subcommand exports credentials, not settings/plugins/project content.
      const credentials = await execute('omp', ['auth', 'export'], '', { ...options(), env: { ...process.env }, privateOutput: true });
      await execute('omp', ['auth', 'import', '-'], credentials, { ...options(), privateOutput: true });
      args = ['--print', '--mode', 'text', '--no-session', '--no-tools', '--no-extensions', '--no-skills', '--no-rules', '--no-context-files', '--no-lsp', '--no-pty', '--no-title', '--offline'];
    } else if (agent === 'claude') {
      const config = join(home, '.claude');
      await mkdir(config);
      await copyCredential(join(process.env.CLAUDE_CONFIG_DIR || homedir(), process.env.CLAUDE_CONFIG_DIR ? '.credentials.json' : '.claude/.credentials.json'), join(config, '.credentials.json'));
      env.CLAUDE_CONFIG_DIR = config;
      args = ['--print', '--output-format', 'json', '--input-format', 'text', '--safe-mode', '--restricted', '--tools', '', '--disable-slash-commands', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--no-session-persistence', '--no-chrome'];
    } else {
      const config = join(home, '.codex');
      await mkdir(config);
      await copyCredential(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json'), join(config, 'auth.json'));
      env.CODEX_HOME = config;
      outputFile = join(temporary, 'last-message.txt');
      args = ['--no-daemon', '--ask-for-approval', 'never', 'exec', '--json', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never', '--output-last-message', outputFile];
      const disabled = ['shell_tool', 'unified_exec', 'code_mode', 'code_mode_host', 'code_mode_only', 'apps', 'plugins', 'hooks', 'multi_agent', 'multi_agent_v2', 'browser_use', 'computer_use', 'image_generation', 'view_image', 'memories', 'skill_search', 'skill_mcp_dependency_install', 'tool_suggest', 'sleep_tool'];
      for (const feature of disabled) args.push('--disable', feature);
      args.push('--enable', 'skip_host_skill_discovery');
      for (const setting of ['mcp_servers={}', 'web_search="disabled"', 'project_doc_max_bytes=0', 'skills.include_instructions=false', 'skills.bundled.enabled=false', 'tools.update_plan.enabled=false', 'tools.experimental_request_user_input.enabled=false']) args.push('-c', setting);
    }
    if (model !== undefined) args.push('--model', model);
    if (agent === 'codex') args.push('-');
    let result = await execute(agent, args, prompt, options());
    if (agent === 'claude') {
      let envelope;
      try { envelope = JSON.parse(result); } catch { throw new Error('Claude returned an invalid JSON result envelope'); }
      if (envelope.type !== 'result' || envelope.is_error || typeof envelope.result !== 'string') throw new Error('Claude did not return a successful text result');
      result = envelope.result;
    } else if (agent === 'codex') {
      const stat = await lstat(outputFile);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > OUTPUT_LIMIT) throw new Error('Codex final output is unsafe or exceeds the output limit');
      result = await readFile(outputFile, 'utf8');
    }
    if (!result.trim()) throw new Error(`${agent} returned no final response`);
    return result;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
