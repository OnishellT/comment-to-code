import { lstat, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { assertCompleteAnalysis } from './analyze.js';

const START = '<!-- comment-to-code:start -->';
const END = '<!-- comment-to-code:end -->';
const TARGETS = ['rules.md', 'AGENTS.md', 'CLAUDE.md'];

function replaceBlock(content, body, name) {
  const starts = content.split(START).length - 1;
  const ends = content.split(END).length - 1;
  const tokens = content.match(/<!--\s*comment-to-code\b/gi) ?? [];
  if (starts !== ends || starts > 1 || tokens.length !== starts + ends || (starts && content.indexOf(START) > content.indexOf(END))) {
    throw new Error(`Cannot publish: malformed or multiple owned markers in ${name}`);
  }
  const block = `${START}\n${body}\n${END}`;
  if (starts) return content.slice(0, content.indexOf(START)) + block + content.slice(content.indexOf(END) + END.length);
  return content + (content ? (content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n') : '') + block + '\n';
}

function markdown(value) {
  return value.trim().replace(/\s+/g, ' ').replace(/[\\`*_{}\[\]<>#!|]/g, '\\$&');
}

function evidenceLink(reference, repository) {
  const target = /^https?:\/\//i.test(reference) ? reference : `${repository.url.replace(/\/$/, '')}/commit/${encodeURIComponent(reference)}`;
  let url;
  try {
    url = new URL(target);
  } catch {
    throw new Error('Cannot publish: invalid evidence URL');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Cannot publish: unsafe evidence URL');
  return `[evidence](${url.href.replace(/[()<>]/g, char => encodeURIComponent(char))})`;
}

function render(analysis) {
  if (typeof analysis.repository.url !== 'string') throw new Error('Cannot publish: repository URL is required');
  const lines = ['## Learned prevention rules', ''];
  if (!analysis.rules.length) lines.push('No prevention rules have reached two verified mistake occurrences.');
  for (const rule of [...analysis.rules].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`- **${markdown(rule.id)}**: ${markdown(rule.instruction)} (${rule.incidentCount} verified mistake occurrences).`);
    lines.push(`  Evidence: ${rule.evidence.map(reference => evidenceLink(reference, analysis.repository)).join(', ')}.`);
  }
  return lines.join('\n');
}

export async function publishRules(cwd, analysis) {
  assertCompleteAnalysis(analysis);
  const rules = render(analysis);
  const reference = '## Learned prevention rules\n\nRead and follow the evidence-backed prevention rules in [rules.md](rules.md).';
  const plans = [];
  // Inspect every target before writing even a temporary file. A bad final
  // target must not leave the first two instruction files partially replaced.
  for (const name of TARGETS) {
    const path = join(cwd, name);
    let content = '';
    let mode = 0o644;
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error(`Cannot publish: ${name} must be a regular file, not a symlink`);
      mode = info.mode & 0o777;
      content = await readFile(path, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const next = replaceBlock(content, name === 'rules.md' ? rules : reference, name);
    plans.push({ path, content, next, mode });
  }
  const staged = [];
  try {
    for (const plan of plans) {
      if (plan.content === plan.next) continue;
      const temporary = join(cwd, `.comment-to-code-${randomUUID()}.tmp`);
      await writeFile(temporary, plan.next, { flag: 'wx', mode: plan.mode });
      staged.push({ ...plan, temporary });
    }
    for (const plan of staged) await rename(plan.temporary, plan.path);
  } finally {
    for (const plan of staged) {
      try {
        await unlink(plan.temporary);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  return { files: TARGETS.map(name => join(cwd, name)) };
}
