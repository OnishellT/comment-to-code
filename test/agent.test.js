import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAgentPrompt } from '../src/agent.js';

async function fixture(t, body) {
  const dir = await mkdtemp(join(tmpdir(), 'ctc-adapter-test-'));
  const path = process.env.PATH;
  const log = process.env.CTC_TEST_LOG;
  process.env.PATH = `${dir}:${path}`;
  process.env.CTC_TEST_LOG = join(dir, 'calls.jsonl');
  t.after(async () => { process.env.PATH = path; if (log === undefined) delete process.env.CTC_TEST_LOG; else process.env.CTC_TEST_LOG = log; await rm(dir, { recursive: true, force: true }); });
  for (const agent of ['omp', 'claude', 'codex']) {
    const file = join(dir, agent);
    await writeFile(file, `#!${process.execPath}\nimport fs from 'node:fs';\nconst args=process.argv.slice(2); const stdin=fs.readFileSync(0,'utf8'); fs.appendFileSync(process.env.CTC_TEST_LOG,JSON.stringify({args,stdin,cwd:process.cwd(),home:process.env.HOME,agent:process.argv[1].split('/').pop()})+'\\n');\nif(args[0]==='auth'){ if(args[1]==='export') process.stdout.write('{}'); process.exit(0); }\n${body}\n`);
    await chmod(file, 0o755);
  }
  return { dir, calls: async () => (await readFile(process.env.CTC_TEST_LOG, 'utf8')).trim().split('\n').map(JSON.parse) };
}

for (const agent of ['omp', 'claude', 'codex']) {
  test(`${agent} uses stdin, exact output protocol, isolation, and cleanup`, async t => {
    const f = await fixture(t, `if(process.argv[1].endsWith('/claude')) process.stdout.write(JSON.stringify({type:'result',is_error:false,result:stdin})); else if(process.argv[1].endsWith('/codex')) { fs.writeFileSync(args[args.indexOf('--output-last-message')+1],stdin); process.stdout.write('non-final logs'); } else process.stdout.write(stdin);`);
    const prompt = '{"private":"$(touch NEVER); @AGENTS.md"}';
    const model = 'model; touch NEVER';
    assert.equal(await runAgentPrompt(agent, prompt, { model }), prompt);
    const calls = await f.calls();
    const call = calls.at(-1);
    assert.equal(call.stdin, prompt);
    assert.ok(!call.args.includes(prompt));
    assert.equal(call.args[call.args.indexOf('--model') + 1], model);
    assert.notEqual(call.cwd, process.cwd());
    assert.ok(call.cwd.startsWith(tmpdir()));
    assert.ok(call.home.startsWith(join(call.cwd, '..')));
    await assert.rejects(access(call.cwd), { code: 'ENOENT' });
    await assert.rejects(access(join(f.dir, 'NEVER')), { code: 'ENOENT' });
    if (agent === 'omp') {
      assert.deepEqual(calls.slice(0, 2).map(c => c.args), [['auth', 'export'], ['auth', 'import', '-']]);
      for (const flag of ['--no-tools', '--no-extensions', '--no-skills', '--no-rules', '--no-context-files', '--no-session']) assert.ok(call.args.includes(flag));
      assert.equal(call.args[call.args.indexOf('--mode') + 1], 'text');
    } else if (agent === 'claude') {
      assert.equal(call.args[call.args.indexOf('--tools') + 1], '');
      assert.equal(call.args[call.args.indexOf('--output-format') + 1], 'json');
      for (const flag of ['--safe-mode', '--restricted', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']) assert.ok(call.args.includes(flag));
    } else {
      assert.equal(call.args[call.args.indexOf('--sandbox') + 1], 'read-only');
      assert.equal(call.args[call.args.indexOf('--ask-for-approval') + 1], 'never');
      for (const flag of ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check']) assert.ok(call.args.includes(flag));
      for (const feature of ['shell_tool', 'code_mode', 'code_mode_host', 'apps', 'plugins', 'hooks', 'multi_agent']) assert.ok(call.args.some((value, i) => value === '--disable' && call.args[i + 1] === feature));
      assert.ok(call.args.includes('mcp_servers={}'));
      assert.equal(call.args.at(-1), '-');
    }
    assert.ok(!call.args.some(value => /bypass|skip-permissions|auto-approve/.test(value)));
  });
}

for (const agent of ['omp', 'claude', 'codex']) {
  test(`${agent} nonzero exit is actionable without leaking private stderr`, async t => {
    const f = await fixture(t, "process.stderr.write('authentication failed secret-token private prompt'); process.exit(7);");
    await assert.rejects(runAgentPrompt(agent, 'private prompt'), error => /exit 7/.test(error.message) && !/secret-token|private prompt/.test(error.message));
    await assert.rejects(access((await f.calls()).at(-1).cwd), { code: 'ENOENT' });
  });
  test(`${agent} timeout kills process and cleans temporary files`, async t => {
    const f = await fixture(t, 'setInterval(()=>{},1000);');
    await assert.rejects(runAgentPrompt(agent, 'prompt', { timeoutMs: 400 }), /timed out/);
    const calls = await f.calls();
    await assert.rejects(access(calls.at(-1).cwd), { code: 'ENOENT' });
  });
}

test('Codex accepts large context and returns only the final response', async t => {
  const final = '{"findings":[]}';
  const f = await fixture(t, `if(!args.includes('--json')) process.stderr.write(stdin); fs.writeFileSync(args[args.indexOf('--output-last-message')+1],${JSON.stringify(final)}); process.stdout.write(JSON.stringify({type:'item.completed',item:{text:'not the final response'}})+'\\n');`);
  const prompt = 'Captured review context\\n'.repeat(4096);
  assert.equal(await runAgentPrompt('codex', prompt), final);
  assert.equal((await f.calls()).at(-1).stdin, prompt);
});

test('Codex still rejects oversized diagnostics', async t => {
  await fixture(t, "process.stderr.write('x'.repeat(65537)); fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'not accepted');");
  await assert.rejects(runAgentPrompt('codex', 'context'), /stderr limit/);
});

test('rejects invalid Claude result envelope and oversized output', async t => {
  await fixture(t, "process.stdout.write(process.argv[1].endsWith('/claude') ? '{\"type\":\"result\",\"is_error\":true,\"result\":\"oops\"}' : 'x'.repeat(9*1024*1024));");
  await assert.rejects(runAgentPrompt('claude', 'prompt'), /successful text result/);
  await assert.rejects(runAgentPrompt('omp', 'prompt'), /output limit/);
});

test('rejects unsupported agents, invalid options, and oversized prompts before execution', async () => {
  await assert.rejects(runAgentPrompt('other', 'prompt'), /Agent must/);
  await assert.rejects(runAgentPrompt('omp', ''), /nonempty/);
  await assert.rejects(runAgentPrompt('omp', 'prompt', { timeoutMs: 0 }), /timeoutMs/);
  await assert.rejects(runAgentPrompt('omp', 'prompt', { model: '--bad' }), /Model must/);
  await assert.rejects(runAgentPrompt('omp', 'x'.repeat(17 * 1024 * 1024)), /16 MiB/);
});
