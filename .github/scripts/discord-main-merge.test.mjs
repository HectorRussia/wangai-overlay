import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMessages, collectIssueIds, notifyMainMerge, webhookAddress, promoteIssues } from './discord-main-merge.mjs';

const repo = 'HectorRussia/wangai-overlay';
const sha = (n) => n.toString(16).padStart(40, '0');
const webhook = 'https://discord.com/api/webhooks/123/secret-token';
const channelId = '1555581629072670781';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function promotionFixture(names, { missingProd = false, failId } = {}) {
  const issues = names.map((name, index) => ({ ...issue(`OVE-${index + 1}`), state: { id: name, name } }));
  const writes = [];
  const fetchImpl = async (_url, options) => {
    const { operationName, variables } = JSON.parse(options.body);
    if (operationName === 'ProdState') return json({ data: { organization: { urlKey: 'foro' }, workflowStates: { nodes: missingProd ? [] : [{ id: 'prod', name: 'Prod', team: { id: 'team-ove', key: 'OVE' } }] } } });
    const current = issues.find((entry) => entry.id === (variables.issueId ?? variables.id));
    if (operationName === 'NotificationIssue') return json({ data: { organization: { urlKey: 'foro' }, issue: current } });
    assert.equal(operationName, 'UpdateIssueStatus');
    if (current.id === failId) return json({ data: { issueUpdate: { success: false } } });
    writes.push(current.id);
    current.state = { id: 'prod', name: 'Prod' };
    return json({ data: { issueUpdate: { success: true, issue: current } } });
  };
  return { issues, writes, fetchImpl };
}

test('only QA is promoted; all manual states and already Prod are preserved', async () => {
  const f = promotionFixture(['QA', 'Prod', 'reject', 'In Progress', 'In Review', 'your_task', 'Done', 'Canceled']);
  const results = await promoteIssues(f.issues, 'key', f.fetchImpl);
  assert.deepEqual(f.writes, ['OVE-1']);
  assert.deepEqual(results.map((entry) => entry.promotion), ['promoted', 'already-prod', ...Array(6).fill('skipped')]);
  const text = buildMessages(pr('dev'), results, repo)[0].embeds[0].description;
  assert.match(text, /QA → Prod: 1 งาน/);
  assert.match(text, /อยู่ Prod แล้ว/);
  assert.match(text, /ไม่ได้ย้าย \(reject\)/);
});

test('missing Prod or wrong team prevents all writes', async () => {
  const missing = promotionFixture(['QA'], { missingProd: true });
  await assert.rejects(promoteIssues(missing.issues, 'key', missing.fetchImpl), /exactly one Prod/);
  assert.equal(missing.writes.length, 0);
  const wrong = promotionFixture(['QA', 'QA']);
  wrong.issues[1].team = { id: 'other', key: 'OVE' };
  await assert.rejects(promoteIssues(wrong.issues, 'key', wrong.fetchImpl), /mismatched/);
  assert.equal(wrong.writes.length, 0);
});

test('partial failure is recoverable without rewriting already Prod issues', async () => {
  const f = promotionFixture(['QA', 'QA'], { failId: 'OVE-2' });
  await assert.rejects(promoteIssues(f.issues, 'key', f.fetchImpl), /did not confirm/);
  assert.deepEqual(f.writes, ['OVE-1']);
  const retry = promotionFixture(f.issues.map((entry) => entry.state.name));
  const results = await promoteIssues(retry.issues, 'key', retry.fetchImpl);
  assert.deepEqual(retry.writes, ['OVE-2']);
  assert.deepEqual(results.map((entry) => entry.promotion), ['already-prod', 'promoted']);
});

test('archived QA is not promoted', async () => {
  const f = promotionFixture(['QA']);
  f.issues[0].archivedAt = '2026-09-30T00:00:00Z';
  assert.equal((await promoteIssues(f.issues, 'key', f.fetchImpl))[0].promotion, 'skipped');
  assert.equal(f.writes.length, 0);
});

test('forum webhook is rejected before any API call or mutation', async () => {
  const { args, calls } = fixture();
  args.webhookUrl = `${webhook}?thread_id=456`;
  await assert.rejects(notifyMainMerge(args), /without thread_id/);
  assert.equal(calls.length, 0);
});

test('unexpected Discord destination fails rather than reporting success', async () => {
  const { args } = fixture({ response: (url, options) => url.startsWith(webhook) && options.method === 'POST' ? json({ id: '123', channel_id: '999' }) : undefined });
  await assert.rejects(notifyMainMerge(args), /unexpected destination channel/);
});

for (const metadata of [{ type: 1, channel_id: '999' }, { type: 2, channel_id: channelId }, {}]) {
  test(`wrong or incomplete webhook metadata stops before Linear: ${JSON.stringify(metadata)}`, async () => {
    const { args, calls } = fixture({ pull: pr('dev'), response: (url, options) =>
      url === webhook && options.method === 'GET' ? json(metadata) : undefined });
    await assert.rejects(notifyMainMerge(args), /configured text channel/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'GET');
  });
}

test('promotion failure never sends a Discord success message', async () => {
  const pull = pr('dev');
  const { args, calls } = fixture({ pull, response: (url, options) => {
    if (url.includes('/commits/')) return json({ sha: pull.merge_commit_sha, parents: [{ sha: sha(1000) }, { sha: sha(1001) }] });
    if (url.includes('/compare/')) return json({ total_commits: 1, commits: [{ sha: sha(1) }] });
    if (url.includes('/pulls?')) return json([{ merged_at: pull.merged_at, merge_commit_sha: sha(1), base: { ref: 'dev' }, head: { ref: 'ove-123', repo: { full_name: repo } } }]);
    if (options.body && JSON.parse(options.body).operationName === 'UpdateIssueStatus') return json({ data: { issueUpdate: { success: false } } });
  } });
  await assert.rejects(notifyMainMerge(args), /did not confirm/);
  assert.ok(calls.every((call) => !(call.url.startsWith(webhook) && call.options.method === 'POST')));
});
function pr(head = 'user/ove-123-title') {
  return { number: 42, title: 'Release @everyone **test**', state: 'closed', merged: true,
    merged_at: '2026-09-30T13:24:00Z', merge_commit_sha: sha(999), merged_by: { login: 'maintainer' },
    head: { ref: head, repo: { full_name: repo } }, base: { ref: 'main', repo: { full_name: repo } } };
}
function issue(id = 'OVE-123') {
  return { id, state: { id: 'qa', name: 'QA' }, identifier: id, title: 'ชื่องาน [link](https://evil.test) @everyone',
    url: `https://linear.app/foro/issue/${id}/task`, team: { id: 'team-ove', key: 'OVE' }, assignee: null };
}
function fixture({ pull = pr(), data, response } = {}) {
  const calls = [];
  const args = { eventName: 'pull_request', repository: repo, githubToken: 'github-secret',
    linearApiKey: 'linear-secret', webhookUrl: webhook,
    event: { action: 'closed', repository: { full_name: repo }, pull_request: structuredClone(pull) },
    fetchImpl: async (url, options) => {
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, options, body });
      if (response) {
        const forced = response(url, options);
        if (forced !== undefined) return forced;
      }
      if (url.startsWith('https://api.github.com/')) return json(pull);
      if (url === 'https://api.linear.app/graphql') {
        if (body.operationName === 'ProdState') return json({ data: { organization: { urlKey: 'foro' }, workflowStates: { nodes: [{ id: 'prod', name: 'Prod', team: { id: 'team-ove', key: 'OVE' } }] } } });
        if (body.operationName === 'UpdateIssueStatus') return json({ data: { issueUpdate: { success: true, issue: { id: body.variables.id, state: { id: 'prod', name: 'Prod' } } } } });
        assert.equal(body.operationName, 'NotificationIssue');
        assert.doesNotMatch(body.query, /mutation|issueUpdate/);
        return json({ data: data ?? { organization: { urlKey: 'foro' }, issue: issue(body.variables.issueId) } });
      }
      assert.equal(options.headers?.Authorization, undefined);
      if (options.method === 'GET') {
        assert.equal(url, webhook);
        return json({ type: 1, channel_id: channelId });
      }
      assert.equal(url, `${webhook}?wait=true`);
      return json({ id: '123456', channel_id: channelId });
    } };
  return { args, calls, pull };
}

test('direct main merge sends a green embed with Thai time, links, and no mentions or mutations', async () => {
  const { args, calls } = fixture();
  const result = await notifyMainMerge(args);
  assert.equal(result.outcome, 'sent');
  assert.deepEqual(result.deliveries, [{ messageId: '123456', channelId }]);
  assert.equal(calls.length, 4);
  const message = calls.at(-1).body;
  assert.equal(message.username, 'WANGAI Bot');
  assert.deepEqual(message.allowed_mentions, { parse: [] });
  const embed = message.embeds[0];
  assert.equal(embed.color, 0x2ecc71);
  assert.equal(embed.title, '🚀 Merged to main');
  assert.match(embed.description, /OVE-123.*ยังไม่ระบุ/);
  assert.match(embed.description, /https:\/\/linear.app\/foro\/issue\/OVE-123/);
  assert.match(embed.footer.text, /20:24/);
  assert.doesNotMatch(embed.description, /@everyone/);
  assert.match(embed.description, /ชื่องาน/);
  assert.ok(calls.every((call) => call.body?.operationName !== 'UpdateIssueStatus'));
  assert.equal(embed.url, `https://github.com/${repo}/pull/42`);
  for (const call of calls) assert.equal(call.options.redirect, 'error');
});

for (const change of [
  { action: 'opened' }, { merged: false }, { base: { ref: 'dev' } },
  { head: { repo: { full_name: 'someone/fork' } } },
]) {
  test(`skip irrelevant event ${JSON.stringify(change)}`, async () => {
    const { args, calls } = fixture();
    if (change.action) args.event.action = change.action;
    else Object.assign(args.event.pull_request, change);
    args.webhookUrl = '';
    assert.equal((await notifyMainMerge(args)).outcome, 'skipped');
    assert.equal(calls.length, 0);
  });
}

test('no OVE branch still notifies PR summary without a Linear key or API call', async () => {
  const { args, calls } = fixture({ pull: pr('maintenance') });
  args.linearApiKey = '';
  assert.equal((await notifyMainMerge(args)).outcome, 'sent');
  assert.equal(calls.length, 3);
  assert.match(calls.at(-1).body.embeds[0].description, /ไม่พบงาน OVE/);
});

test('multiple IDs on a direct branch fail before sending', async () => {
  const { args, calls } = fixture({ pull: pr('ove-123-ove-456') });
  await assert.rejects(notifyMainMerge(args), /multiple OVE/);
  assert.equal(calls.length, 2);
});

test('release collection paginates commits and PRs, deduplicates IDs and excludes old/future work', async () => {
  const pull = pr('dev');
  const visited = [];
  const child = (id, commit) => ({ merged_at: pull.merged_at, merge_commit_sha: sha(commit),
    base: { ref: 'dev' }, head: { ref: `user/${id}-title`, repo: { full_name: repo } } });
  const first = [child('ove-123', 1), child('OVE-123', 2), child('ove-3', 3),
    child('ove-999', 500), child('ove-998', 501),
    { ...child('ove-997', 4), merged_at: null },
    { ...child('ove-996', 5), head: { ref: 'ove-996', repo: { full_name: 'other/fork' } } }];
  while (first.length < 100) first.push({ merged_at: null });
  const ids = await collectIssueIds(pull, async (path) => {
    visited.push(path);
    if (path.startsWith('/commits/')) return { sha: pull.merge_commit_sha, parents: [{ sha: sha(1000) }, { sha: sha(1001) }] };
    if (path.startsWith('/compare/')) {
      assert.ok(path.startsWith(`/compare/${sha(1000)}...${sha(1001)}`));
      return { total_commits: 101, commits: path.endsWith('page=1')
        ? Array.from({ length: 100 }, (_, i) => ({ sha: sha(i + 1) })) : [{ sha: sha(101) }] };
    }
    assert.match(path, /state=closed&base=dev/);
    return path.endsWith('page=1') ? first : [child('ove-456', 101)];
  });
  assert.deepEqual(ids, ['OVE-3', 'OVE-123', 'OVE-456']);
  assert.equal(visited.length, 5);
});

test('dev release fully integrates collection, Linear lookup, and Discord notification', async () => {
  const pull = pr('dev');
  const { args, calls } = fixture({ pull, response: (url) => {
    if (url.includes('/commits/')) return json({ sha: pull.merge_commit_sha, parents: [{ sha: sha(1000) }, { sha: sha(1001) }] });
    if (url.includes('/compare/')) return json({ total_commits: 1, commits: [{ sha: sha(1) }] });
    if (url.includes('/pulls?')) return json([{ merged_at: pull.merged_at, merge_commit_sha: sha(1),
      base: { ref: 'dev' }, head: { ref: 'ove-123-feature', repo: { full_name: repo } } }]);
  } });
  assert.equal((await notifyMainMerge(args)).outcome, 'sent');
  assert.equal(calls.filter((call) => call.body?.operationName === 'UpdateIssueStatus').length, 1);
  assert.match(calls.at(-1).body.embeds[0].description, /1 งาน • dev → main/);
});

test('squash/rebase release is rejected instead of sending an inaccurate list', async () => {
  await assert.rejects(collectIssueIds(pr('dev'), async () => ({ sha: sha(999), parents: [{ sha: sha(1) }] })), /Create a merge commit/);
});

test('incomplete compare pagination fails', async () => {
  await assert.rejects(collectIssueIds(pr('dev'), async (path) => path.startsWith('/commits/')
    ? { sha: sha(999), parents: [{ sha: sha(1) }, { sha: sha(2) }] }
    : { total_commits: 5, commits: [] }), /truncated/);
});

test('long lists split into bounded messages without losing any issues', () => {
  const issues = Array.from({ length: 40 }, (_, i) => ({ ...issue(`OVE-${i + 1}`), title: '*'.repeat(1000), assignee: { name: 'A'.repeat(300) } }));
  const messages = buildMessages(pr('dev'), issues, repo);
  assert.ok(messages.length > 1);
  const descriptions = messages.map((message) => {
    assert.deepEqual(message.allowed_mentions, { parse: [] });
    const embed = message.embeds[0];
    assert.ok(embed.description.length <= 3500);
    assert.ok(embed.fields.every((field) => field.value.length <= 1024));
    return embed.description;
  }).join('\n');
  for (const entry of issues) assert.equal(descriptions.split(`[${entry.identifier}]`).length - 1, 1);
});

test('valid versioned text-channel webhook forces wait=true', () => {
  assert.equal(webhookAddress('https://discord.com/api/v10/webhooks/123/token?wait=false'),
    'https://discord.com/api/v10/webhooks/123/token?wait=true');
});

for (const value of ['', 'https://evil.test/api/webhooks/1/secret', 'http://discord.com/api/webhooks/1/secret',
  'https://discord.com/api/webhooks/1/secret?unknown=1', 'https://user:secret@discord.com/api/webhooks/1/token']) {
  test(`invalid webhook is rejected without printing its value (${value.length})`, () => {
    assert.throws(() => webhookAddress(value), (error) => {
      assert.doesNotMatch(error.message, /evil|secret@|\/api\/webhooks/);
      return true;
    });
  });
}

for (const name of ['githubToken', 'linearApiKey', 'webhookUrl']) {
  test(`missing ${name} fails before sending`, async () => {
    const { args, calls } = fixture();
    args[name] = '';
    await assert.rejects(notifyMainMerge(args), /missing/);
    assert.ok(calls.every((call) => !(call.url.startsWith(webhook) && call.options.method === 'POST')));
  });
}

for (const [label, data] of [
  ['wrong workspace', { organization: { urlKey: 'other' }, issue: issue() }],
  ['missing issue', { organization: { urlKey: 'foro' }, issue: null }],
  ['wrong team', { organization: { urlKey: 'foro' }, issue: { ...issue(), team: { key: 'OTHER' } } }],
  ['invalid URL', { organization: { urlKey: 'foro' }, issue: { ...issue(), url: 'https://evil.test/foro/issue/OVE-123/title' } }],
]) {
  test(`${label} fails before Discord`, async () => {
    const { args, calls } = fixture({ data });
    await assert.rejects(notifyMainMerge(args));
    assert.ok(calls.every((call) => !(call.url.startsWith(webhook) && call.options.method === 'POST')));
  });
}

for (const service of ['api.github.com', 'api.linear.app', 'discord.com']) {
  for (const status of [401, 403, 429, 500]) {
    test(`${service} HTTP ${status} is redacted`, async () => {
      const { args } = fixture({ response: (url) => url.includes(service) ? json({ error: webhook }, status) : undefined });
      await assert.rejects(notifyMainMerge(args), (error) => {
        assert.match(error.message, new RegExp(`HTTP ${status}`));
        assert.doesNotMatch(error.message, /secret-token/);
        return true;
      });
    });
  }
}

test('Linear GraphQL errors fail before notification', async () => {
  const { args, calls } = fixture({ response: (url) => url.includes('linear.app') ? json({ errors: [{ message: webhook }] }) : undefined });
  await assert.rejects(notifyMainMerge(args), /GraphQL errors/);
  assert.ok(calls.every((call) => !(call.url.startsWith(webhook) && call.options.method === 'POST')));
});

test('Discord timeout reports possible resend without exposing the URL', async () => {
  const { args } = fixture({ response: (url, options) => { if (url.startsWith(webhook) && options.method === 'POST') throw new Error(webhook); } });
  await assert.rejects(notifyMainMerge(args), (error) => {
    assert.match(error.message, /timed out.*Confirmed 0\/1.*rerun/);
    assert.doesNotMatch(error.message, /secret-token/);
    return true;
  });
});

test('webhook preflight timeout cannot promote issues or send a message', async () => {
  const { args, calls } = fixture({ pull: pr('dev'), response: (url) => {
    if (url === webhook) throw new Error(webhook);
  } });
  await assert.rejects(notifyMainMerge(args), (error) => {
    assert.match(error.message, /failed or timed out/);
    assert.doesNotMatch(error.message, /secret-token/);
    return true;
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
});

test('promotion respects a manual change after the initial release lookup', async () => {
  const f = promotionFixture(['QA']);
  const initial = structuredClone(f.issues);
  f.issues[0].state = { id: 'reject', name: 'reject' };
  const result = await promoteIssues(initial, 'key', f.fetchImpl);
  assert.equal(result[0].promotion, 'skipped');
  assert.equal(result[0].previousState, 'reject');
  assert.deepEqual(f.writes, []);
});

test('Discord must confirm a saved message', async () => {
  const { args } = fixture({ response: (url, options) => url.startsWith(webhook) && options.method === 'POST' ? json({}) : undefined });
  await assert.rejects(notifyMainMerge(args), /did not confirm/);
});

test('partial Discord delivery reports confirmed messages and never hides the failure', async () => {
  const pull = pr('dev');
  let posts = 0;
  const { args } = fixture({ pull, response: (url, options) => {
    if (url.includes('/commits/')) return json({ sha: pull.merge_commit_sha, parents: [{ sha: sha(1000) }, { sha: sha(1001) }] });
    if (url.includes('/compare/')) return json({ total_commits: 10, commits: Array.from({ length: 10 }, (_, i) => ({ sha: sha(i + 1) })) });
    if (url.includes('/pulls?')) return json(Array.from({ length: 10 }, (_, i) => ({ merged_at: pull.merged_at,
      merge_commit_sha: sha(i + 1), base: { ref: 'dev' }, head: { ref: `ove-${i + 1}`, repo: { full_name: repo } } })));
    if (url.includes('api.linear.app') && JSON.parse(options.body).operationName === 'NotificationIssue') {
      const id = JSON.parse(options.body).variables.issueId;
      return json({ data: { organization: { urlKey: 'foro' }, issue: { ...issue(id), title: '*'.repeat(300) } } });
    }
    if (url.startsWith(webhook) && options.method === 'POST') {
      posts++;
      return posts === 1 ? json({ id: '123', channel_id: channelId }) : json({ error: webhook }, 500);
    }
  } });
  await assert.rejects(notifyMainMerge(args), (error) => {
    assert.match(error.message, /Confirmed 1\/\d+ messages.*rerun/);
    assert.doesNotMatch(error.message, /secret-token/);
    return true;
  });
  assert.equal(posts, 2);
});
