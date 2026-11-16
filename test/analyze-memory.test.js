import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('large history processes every comment without retaining a full PR prompt per comment', async () => {
  const moduleUrl = new URL('../src/analyze.js', import.meta.url).href;
  const program = `
    import { analyzeCapture, findingsFor } from ${JSON.stringify(moduleUrl)};
    const repository = { owner: 'test', name: 'history', host: 'github.com', url: 'https://github.com/test/history' };
    const comments = Array.from({ length: 128 }, (_, i) => ({ id: 'discussion:' + i, threadId: 'discussion:' + i, body: 'Thanks', url: repository.url + '/pull/1#issuecomment-' + i }));
    const capture = { version: 1, repository, pullRequests: [{ number: 1, url: repository.url + '/pull/1', comments, commits: [], files: [], sources: [{ path: 'large.js', ref: 'head', content: 'x'.repeat(512 * 1024), unavailableReason: null }], limitations: [] }] };
    let calls = 0;
    const analysis = await analyzeCapture(capture, { runAgent: async prompt => {
      calls++;
      const data = JSON.parse(prompt.slice(prompt.indexOf('\\nDATA ') + 6));
      return JSON.stringify({ comments: data.targets.map(target => ({ commentId: target.commentId, claims: [{ excerpt: 'Thanks', category: 'praise', rootCause: null, prevention: null, resolution: null, evidence: [], confidence: 'high', status: 'ignored', outcome: 'not-applicable', codeEvidence: [] }] })) });
    } });
    console.log(JSON.stringify({ comments: analysis.stats.comments, findings: findingsFor(analysis).length, calls, rules: analysis.rules.length }));
  `;
  const { stdout } = await exec(process.execPath, ['--max-old-space-size=48', '--input-type=module', '--eval', program], { timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.deepEqual(JSON.parse(stdout), { comments: 128, findings: 128, calls: 8, rules: 0 });
});
