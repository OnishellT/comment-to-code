import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PAGE_SIZE = 100;
const FILE_LIMIT = 3000;

async function defaultRunGh(args, { cwd } = {}) {
  const env = { ...process.env, GH_PROMPT_DISABLED: '1' };
  delete env.GH_REPO;
  delete env.GH_HOST;
  const { stdout } = await execFileAsync('gh', args, {
    cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000,
  });
  return stdout;
}

function errorText(error) {
  return String(error.stderr || error.message || error).trim().slice(0, 2000);
}

function parseJson(text, context) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`GitHub returned invalid JSON for ${context}; capture was not completed.`);
  }
}

function remoteIdentity(remote) {
  let host;
  let pathname;
  const scp = /^(?:[^@/]+@)?([^:/]+):([^/].*)$/.exec(remote);
  if (scp && !remote.includes('://')) {
    [, host, pathname] = scp;
  } else {
    let url;
    try { url = new URL(remote); } catch { return null; }
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) return null;
    host = url.hostname;
    pathname = url.pathname.replace(/^\//, '');
  }
  const parts = pathname.replace(/\/$/, '').replace(/\.git$/, '').split('/');
  if (parts.length !== 2 || parts.some(part => !/^[\w.-]+$/.test(part)) || !/^[\w.-]+$/.test(host)) return null;
  return { host: host.toLowerCase(), owner: parts[0], name: parts[1] };
}

export async function identifyProject({ cwd = process.cwd(), runGh = defaultRunGh } = {}) {
  const git = async args => (await execFileAsync('git', args, {
    cwd, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30000,
  })).stdout.trim();
  let root;
  let remote;
  try {
    root = await git(['rev-parse', '--show-toplevel']);
    const remotes = (await git(['remote'])).split('\n').filter(Boolean);
    const selected = remotes.includes('origin') ? 'origin' : remotes.length === 1 ? remotes[0] : null;
    if (!selected) throw new Error('Configure an origin remote (or a single unambiguous remote).');
    remote = await git(['config', '--get', `remote.${selected}.url`]);
  } catch (error) {
    throw new Error(`Cannot identify the Git checkout at ${cwd}: ${errorText(error)}`);
  }
  const identity = remoteIdentity(remote);
  if (!identity) throw new Error('The checkout remote must be a GitHub HTTPS, SSH, or Git repository URL.');
  let data;
  try {
    const target = `${identity.host}/${identity.owner}/${identity.name}`;
    data = parseJson(await runGh(['repo', 'view', target, '--json', 'name,owner,url'], { cwd: root }), target);
  } catch (error) {
    throw new Error(`Cannot access the checkout's GitHub repository. Install gh and authenticate with gh auth login --hostname ${identity.host}. ${errorText(error)}`);
  }
  let url;
  try { url = new URL(data.url); } catch { throw new Error('gh repo view returned an invalid repository URL.'); }
  if (url.hostname.toLowerCase() !== identity.host || !data.owner?.login || !data.name) {
    throw new Error('gh repo view returned a repository outside the checkout remote host.');
  }
  return {
    cwd: root,
    repository: { owner: data.owner.login, name: data.name, host: identity.host, url: data.url },
  };
}

function assertCount(actual, expected, context) {
  if (!Number.isInteger(expected) || actual !== expected) {
    throw new Error(`Incomplete ${context}: captured ${actual}, expected ${expected}. GitHub may have truncated the response or the PR changed; retry capture.`);
  }
}

function completePatch(file) {
  if (typeof file.patch !== 'string' || file.truncated === true) return false;
  let oldCount = 0;
  let newCount = 0;
  let additions = 0;
  let deletions = 0;
  let hunk = false;
  const lines = file.patch.split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    const header = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@(?:.*)$/.exec(line);
    if (header) {
      if (oldCount || newCount) return false;
      oldCount = header[1] === undefined ? 1 : Number(header[1]);
      newCount = header[2] === undefined ? 1 : Number(header[2]);
      hunk = true;
    } else if (line.startsWith('\\ No newline at end of file')) {
      continue;
    } else if (hunk && line.startsWith('+')) {
      newCount--; additions++;
    } else if (hunk && line.startsWith('-')) {
      oldCount--; deletions++;
    } else if (hunk && line.startsWith(' ')) {
      oldCount--; newCount--;
    } else {
      return false;
    }
    if (oldCount < 0 || newCount < 0) return false;
  }
  return oldCount === 0 && newCount === 0 && additions === file.additions && deletions === file.deletions;
}

function fileChange(file, limitations) {
  if (typeof file.filename !== 'string' || typeof file.status !== 'string') {
    throw new Error('GitHub returned malformed file metadata; capture was not completed.');
  }
  const complete = completePatch(file);
  if (!complete) limitations.push(`Patch unavailable for ${file.filename}: binary, missing, or truncated by GitHub.`);
  return { path: file.filename, previousPath: file.previous_filename ?? null, status: file.status, patch: complete ? file.patch : null };
}

function comment(item, kind, threadId) {
  if (item.id === undefined || typeof item.body !== 'string' && item.body !== null) {
    throw new Error(`GitHub returned malformed ${kind} comment data; capture was not completed.`);
  }
  return {
    id: `${kind}:${item.id}`, kind, body: item.body ?? '', url: item.html_url,
    author: item.user?.login ?? null,
    createdAt: item.created_at ?? item.submitted_at ?? null,
    updatedAt: item.updated_at ?? item.submitted_at ?? item.created_at ?? null,
    threadId, path: kind === 'inline' ? item.path : null,
    line: kind === 'inline' ? item.line ?? item.original_line ?? null : null,
    originalCommitId: kind === 'inline' ? item.original_commit_id ?? item.commit_id ?? null : kind === 'review' ? item.commit_id ?? null : null,
    diffHunk: kind === 'inline' ? item.diff_hunk ?? null : null,
    reviewState: kind === 'review' ? item.state ?? null : null,
  };
}

export async function captureProject({ cwd = process.cwd(), runGh = defaultRunGh } = {}) {
  const project = await identifyProject({ cwd, runGh });
  const repository = project.repository;
  const prefix = `repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
  const api = async endpoint => {
    try {
      return parseJson(await runGh([
        'api', '--hostname', repository.host, '-H', 'Accept: application/vnd.github+json',
        '-H', 'X-GitHub-Api-Version: 2022-11-28', endpoint,
      ], { cwd: project.cwd }), endpoint);
    } catch (error) {
      const failure = new Error(`GitHub request failed for ${endpoint}: ${errorText(error)} Check gh auth status --hostname ${repository.host}, repository access, and API rate limits; capture was not completed.`, { cause: error });
      failure.status = error.status ?? (/\bHTTP\s+(\d{3})\b/i.exec(errorText(error))?.[1]);
      throw failure;
    }
  };
  const paginate = async (endpoint, { field, limit, key = item => item.id } = {}) => {
    const items = [];
    const seen = new Set();
    for (let page = 1; ; page++) {
      const data = await api(`${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=${PAGE_SIZE}&page=${page}`);
      const batch = field ? data[field] : data;
      if (!Array.isArray(batch) || data?.truncated === true) throw new Error(`Incomplete or malformed paginated response for ${endpoint}.`);
      for (const item of batch) {
        const id = key(item);
        if (id === undefined || seen.has(id)) throw new Error(`Repeated or missing item identity while paginating ${endpoint}; retry capture.`);
        seen.add(id);
        items.push(item);
      }
      // The commit-file endpoint exposes no total beyond its documented cap.
      if (limit && items.length >= limit) throw new Error(`GitHub's ${limit}-item API limit was reached for ${endpoint}; refusing an incomplete capture.`);
      if (batch.length < PAGE_SIZE) return items;
    }
  };
  const source = async (path, ref) => {
    const result = { path, ref, content: null, unavailableReason: null };
    if (!ref) return { ...result, unavailableReason: 'Reviewed commit identity is unavailable.' };
    let data;
    try {
      data = await api(`${prefix}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
    } catch (error) {
      if (String(error.status) !== '404') throw error;
      return { ...result, unavailableReason: 'File or commit is missing, deleted, or inaccessible (HTTP 404).' };
    }
    if (data.type !== 'file' || data.submodule_git_url) return { ...result, unavailableReason: 'Path is not a regular source file.' };
    if (data.truncated === true || data.encoding !== 'base64' || typeof data.content !== 'string') {
      return { ...result, unavailableReason: 'GitHub did not provide complete base64 source content (large or truncated file).' };
    }
    const encoded = data.content.replace(/\s/g, '');
    if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      return { ...result, unavailableReason: 'GitHub returned invalid base64 source content.' };
    }
    const bytes = Buffer.from(encoded, 'base64');
    if (!Number.isSafeInteger(data.size) || bytes.length !== data.size) return { ...result, unavailableReason: 'Source content is truncated or its byte size is unavailable.' };
    try {
      if (bytes.includes(0)) throw new Error('Binary');
      result.content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      result.unavailableReason = 'Binary or non-UTF-8 source content.';
    }
    return result;
  };

  const pulls = await paginate(`${prefix}/pulls?state=all&sort=created&direction=asc`, { key: item => item.number });
  const pullRequests = [];
  for (const listed of pulls) {
    const endpoint = `${prefix}/pulls/${listed.number}`;
    const detail = await api(endpoint);
    if (detail.commits > 250) throw new Error(`PR #${listed.number} has ${detail.commits} commits, exceeding GitHub's 250-commit pull-request API limit; refusing an incomplete capture.`);
    if (detail.changed_files > FILE_LIMIT) throw new Error(`PR #${listed.number} has ${detail.changed_files} files, exceeding GitHub's ${FILE_LIMIT}-file API limit; refusing an incomplete capture.`);
    if (!detail.base?.sha || !detail.head?.sha) throw new Error(`PR #${listed.number} is missing base/head commit metadata.`);
    const discussion = await paginate(`${prefix}/issues/${listed.number}/comments`);
    const reviews = await paginate(`${endpoint}/reviews`);
    const inline = await paginate(`${endpoint}/comments`);
    assertCount(discussion.length, detail.comments, `discussion comments for PR #${listed.number}`);
    assertCount(inline.length, detail.review_comments, `inline comments for PR #${listed.number}`);
    const limitations = [];
    const inlineById = new Map(inline.map(item => [item.id, item]));
    const threadId = item => {
      const visited = new Set([item.id]);
      while (item.in_reply_to_id != null) {
        const parent = item.in_reply_to_id;
        if (visited.has(parent)) throw new Error(`Invalid cyclic inline reply thread in PR #${listed.number}.`);
        visited.add(parent);
        if (!inlineById.has(parent)) {
          limitations.push(`Inline reply ${item.id} references unavailable parent comment ${parent}.`);
          return `inline:${parent}`;
        }
        item = inlineById.get(parent);
      }
      return `inline:${item.id}`;
    };
    const comments = [
      ...discussion.map(item => comment(item, 'discussion', `discussion:${item.id}`)),
      ...reviews.map(item => comment(item, 'review', `review:${item.id}`)),
      ...inline.map(item => comment(item, 'inline', threadId(item))),
    ];
    const listedCommits = await paginate(`${endpoint}/commits`, { key: item => item.sha });
    assertCount(listedCommits.length, detail.commits, `commits for PR #${listed.number}`);
    const commits = [];
    for (const listedCommit of listedCommits) {
      const commitEndpoint = `${prefix}/commits/${encodeURIComponent(listedCommit.sha)}`;
      const files = await paginate(commitEndpoint, { field: 'files', limit: FILE_LIMIT, key: item => item.filename });
      const commitLimitations = [];
      commits.push({
        sha: listedCommit.sha, message: listedCommit.commit.message,
        authoredAt: listedCommit.commit.author?.date ?? listedCommit.commit.committer?.date ?? null,
        files: files.map(file => fileChange(file, commitLimitations)), limitations: commitLimitations,
      });
    }
    const listedFiles = await paginate(`${endpoint}/files`, { key: item => item.filename });
    assertCount(listedFiles.length, detail.changed_files, `files for PR #${listed.number}`);
    for (const review of reviews) {
      if (!review.created_at && !review.submitted_at) {
        limitations.push(`Review ${review.id} has no submission timestamp (pending review); its body is preserved.`);
      }
    }
    const files = listedFiles.map(file => fileChange(file, limitations));
    const sources = [];
    const sourceKeys = new Set();
    for (const item of comments.filter(item => item.kind === 'inline')) {
      if (typeof item.path !== 'string') throw new Error(`Inline comment ${item.id} has no source path.`);
      for (const ref of [item.originalCommitId, detail.head.sha]) {
        const key = JSON.stringify([item.path, ref]);
        if (sourceKeys.has(key)) continue;
        sourceKeys.add(key);
        sources.push(await source(item.path, ref));
      }
    }
    pullRequests.push({
      number: detail.number, title: detail.title, body: detail.body ?? '', url: detail.html_url,
      state: detail.state, mergedAt: detail.merged_at ?? null,
      createdAt: detail.created_at, updatedAt: detail.updated_at, closedAt: detail.closed_at ?? null,
      author: detail.user?.login ?? null, draft: detail.draft ?? false, mergeCommitSha: detail.merge_commit_sha ?? null,
      baseSha: detail.base.sha, headSha: detail.head.sha,
      comments, commits, files, sources, limitations,
    });
  }
  return { version: 1, repository, capturedAt: new Date().toISOString(), pullRequests };
}
