import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { findIssueIds, syncLinearStatus } from './linear-status-sync.mjs';

const REPOSITORY = 'HectorRussia/wangai-overlay';
const TEAM = { id: 'team-ove', key: 'OVE' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function fixture({ action = 'opened', pr = {}, issue = {}, context = {}, responses = {} } = {}) {
  const original = {
    number: 42,
    state: 'open',
    merged: false,
    draft: false,
    base: { ref: 'dev', repo: { full_name: REPOSITORY } },
    head: { ref: 'username/ove-123-add-feature', repo: { full_name: REPOSITORY } },
    title: 'A title is never used for issue matching',
    body: 'Neither is a PR description',
  };
  const current = { ...structuredClone(original), ...pr };
  const currentIssue = {
    id: 'issue-uuid', identifier: 'OVE-123', team: TEAM,
    archivedAt: null, state: { id: 'progress-state', name: 'In Progress' },
    ...issue,
  };
  const calls = [];
  const args = {
    event: { action, repository: { full_name: REPOSITORY }, pull_request: original },
    eventName: 'pull_request',
    repository: REPOSITORY,
    githubToken: 'fake-github-token',
    linearApiKey: 'fake-linear-key',
    fetchImpl: async (url, options) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      const operation = body?.operationName ?? 'GetPR';
      calls.push({ url, options, operation, body });
      if (Object.hasOwn(responses, operation)) {
        const response = responses[operation];
        return typeof response === 'function' ? response() : response;
      }
      if (url === `https://api.github.com/repos/${REPOSITORY}/pulls/42`) {
        return json(current);
      }
      assert.equal(url, 'https://api.linear.app/graphql');
      if (operation === 'SyncContext') {
        const name = body.variables.filter.name.eq;
        assert.equal(body.variables.issueId, 'OVE-123');
        assert.equal(body.variables.filter.team.key.eq, 'OVE');
        return json({ data: {
          organization: { urlKey: 'foro' },
          issue: currentIssue,
          workflowStates: { nodes: [{ id: name === 'QA' ? 'qa-state' : 'review-state', name, team: TEAM }] },
          ...context,
        } });
      }
      assert.equal(operation, 'UpdateIssueStatus');
      assert.equal(body.variables.id, 'issue-uuid');
      return json({ data: { issueUpdate: {
        success: true,
        issue: { id: 'issue-uuid', state: {
          id: body.variables.stateId,
          name: body.variables.stateId === 'qa-state' ? 'QA' : 'In Review',
        } },
      } } });
    },
  };
  return { args, current, currentIssue, calls };
}

test('extracts complete case-insensitive branch identifiers and deduplicates repeats', () => {
  for (const branch of ['ove-123-title', 'username/OVE-123-title', 'codex/feature_oVe-123']) {
    assert.deepEqual(findIssueIds(branch), ['OVE-123']);
  }
  assert.deepEqual(findIssueIds('ove-123/OVE-123'), ['OVE-123']);
  assert.deepEqual(findIssueIds('ove-123-ove-456'), ['OVE-123', 'OVE-456']);
  for (const branch of ['main', 'foo-123', 'XOVE-123', 'ove-123abc', 'ove-no-number']) {
    assert.deepEqual(findIssueIds(branch), []);
  }
});

for (const action of ['opened', 'reopened', 'ready_for_review', 'synchronize', 'edited']) {
  test(`${action}: a ready PR to dev moves In Progress to In Review`, async () => {
    const { args, calls } = fixture({ action });
    const result = await syncLinearStatus(args);
    assert.deepEqual(result, { outcome: 'updated', message: 'OVE-123: In Progress -> In Review.' });
    assert.deepEqual(calls.map((call) => call.operation), ['GetPR', 'SyncContext', 'UpdateIssueStatus']);
    assert.equal(calls[2].body.variables.stateId, 'review-state');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer fake-github-token');
    assert.equal(calls[1].options.headers.Authorization, 'fake-linear-key');
    assert.equal(calls[0].options.headers['Content-Type'], undefined);
    assert.equal(calls[2].options.headers['Content-Type'], 'application/json');
    for (const call of calls) {
      assert.equal(call.options.redirect, 'error');
      assert.ok(call.options.signal instanceof AbortSignal);
    }
  });
}

for (const state of ['In Progress', 'In Review']) {
  test(`merge into dev moves ${state} to QA`, async () => {
    const { args, calls } = fixture({
      action: 'closed', pr: { state: 'closed', merged: true },
      issue: { state: { id: 'source-state', name: state } },
    });
    const result = await syncLinearStatus(args);
    assert.equal(result.outcome, 'updated');
    assert.equal(calls.at(-1).body.variables.stateId, 'qa-state');
  });
}

test('Draft waits until Ready for review and uses current state instead of the draft event', async () => {
  const { args, current, calls } = fixture({ pr: { draft: true } });
  assert.equal((await syncLinearStatus(args)).outcome, 'skipped');
  assert.equal(calls.length, 1);
  args.event.action = 'ready_for_review';
  args.event.pull_request.draft = true;
  current.draft = false;
  assert.equal((await syncLinearStatus(args)).outcome, 'updated');
});

for (const merged of [false, true]) {
  for (const name of ['your task', 'reject', 'QA', 'Prod', 'Done', 'Canceled', 'Todo', 'Backlog']) {
    test(`preserves ${name} when PR is ${merged ? 'merged' : 'open'}`, async () => {
      const { args, calls } = fixture({
        pr: { merged, state: merged ? 'closed' : 'open' },
        issue: { state: { id: 'current-state', name } },
      });
      assert.equal((await syncLinearStatus(args)).outcome, 'skipped');
      assert.equal(calls.filter((call) => call.operation === 'UpdateIssueStatus').length, 0);
    });
  }
}

test('reject -> manual In Progress -> next push moves to In Review', async () => {
  const { args, currentIssue, calls } = fixture({
    action: 'synchronize', issue: { state: { id: 'reject-state', name: 'reject' } },
  });
  assert.equal((await syncLinearStatus(args)).outcome, 'skipped');
  currentIssue.state = { id: 'progress-state', name: 'In Progress' };
  assert.equal((await syncLinearStatus(args)).outcome, 'updated');
  assert.equal(calls.filter((call) => call.operation === 'UpdateIssueStatus').length, 1);
});

test('rerunning after a successful update does not update again', async () => {
  const { args, currentIssue, calls } = fixture();
  await syncLinearStatus(args);
  currentIssue.state = { id: 'review-state', name: 'In Review' };
  assert.equal((await syncLinearStatus(args)).outcome, 'skipped');
  assert.equal(calls.filter((call) => call.operation === 'UpdateIssueStatus').length, 1);
});

test('an old opened event rerun after merge reconciles to QA, never In Review', async () => {
  const { args, calls } = fixture({ pr: { state: 'closed', merged: true } });
  assert.equal(args.event.pull_request.merged, false);
  assert.equal((await syncLinearStatus(args)).outcome, 'updated');
  assert.equal(calls.at(-1).body.variables.stateId, 'qa-state');
});

for (const [name, pr] of [
  ['closed without merging', { state: 'closed' }],
  ['retargeted away from dev', { base: { ref: 'main', repo: { full_name: REPOSITORY } } }],
  ['merged into a different branch', { merged: true, state: 'closed', base: { ref: 'main' } }],
  ['converted back to draft', { draft: true }],
  ['fork in live PR data', { head: { ref: 'ove-123-title', repo: { full_name: 'someone/fork' } } }],
  ['missing head repository', { head: { ref: 'ove-123-title', repo: null } }],
  ['branch with no ID', { head: { ref: 'feature/title', repo: { full_name: REPOSITORY } }, title: 'OVE-123', body: 'Fixes OVE-123' }],
  ['branch with multiple IDs', { head: { ref: 'ove-123-ove-456', repo: { full_name: REPOSITORY } } }],
]) {
  test(`${name}: no Linear request and no secret required`, async () => {
    const { args, calls } = fixture({ pr });
    args.linearApiKey = '';
    assert.equal((await syncLinearStatus(args)).outcome, 'skipped');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].operation, 'GetPR');
  });
}

test('fork events are rejected before accessing APIs or credentials', async () => {
  const { args, calls } = fixture();
  args.event.pull_request.head.repo.full_name = 'someone/fork';
  args.githubToken = '';
  args.linearApiKey = '';
  assert.equal((await syncLinearStatus(args)).outcome, 'skipped');
  assert.equal(calls.length, 0);
});

test('PR retargeted into dev is eligible on edited', async () => {
  const { args } = fixture({ action: 'edited' });
  args.event.changes = { base: { ref: { from: 'main' } } };
  assert.equal((await syncLinearStatus(args)).outcome, 'updated');
});

for (const change of [
  { eventName: 'push' }, { eventName: 'pull_request_target' },
  { event: { action: 'converted_to_draft' } },
]) {
  test(`unsupported event is skipped: ${JSON.stringify(change)}`, async () => {
    const { args, calls } = fixture();
    assert.equal((await syncLinearStatus({ ...args, ...change })).outcome, 'skipped');
    assert.equal(calls.length, 0);
  });
}

for (const key of ['githubToken', 'linearApiKey']) {
  test(`missing ${key} fails with setup instructions`, async () => {
    const { args } = fixture();
    args[key] = '  ';
    await assert.rejects(syncLinearStatus(args), key === 'githubToken' ? /GITHUB_TOKEN is missing/ : /LINEAR_API_KEY is missing/);
  });
}

for (const [name, changes, error] of [
  ['wrong workspace', { context: { organization: { urlKey: 'other-workspace' } } }, /foro workspace/],
  ['missing issue', { context: { issue: null } }, /OVE-123 was not found/],
  ['wrong issue', { issue: { identifier: 'OVE-999' } }, /expected OVE team/],
  ['wrong team', { issue: { team: { id: 'other-team', key: 'OTHER' } } }, /expected OVE team/],
  ['missing current status', { issue: { state: null } }, /usable current status/],
  ['missing target status', { context: { workflowStates: { nodes: [] } } }, /exactly one OVE status/],
  ['ambiguous target status', { context: { workflowStates: { nodes: [{ id: 'one' }, { id: 'two' }] } } }, /exactly one OVE status/],
  ['target in another team', { context: { workflowStates: { nodes: [{ id: 'review-state', name: 'In Review', team: { id: 'other-team', key: 'OVE' } }] } } }, /target status/],
]) {
  test(`${name} fails before mutation`, async () => {
    const { args, calls } = fixture(changes);
    await assert.rejects(syncLinearStatus(args), error);
    assert.ok(calls.every((call) => call.operation !== 'UpdateIssueStatus'));
  });
}

test('archived issues are preserved', async () => {
  const { args, calls } = fixture({ issue: { archivedAt: '2026-09-01T00:00:00Z' } });
  assert.equal((await syncLinearStatus(args)).outcome, 'skipped');
  assert.equal(calls.length, 2);
});

test('invalid GitHub payload fails before Linear calls', async () => {
  const { args, calls } = fixture({ pr: { merged: undefined } });
  await assert.rejects(syncLinearStatus(args), /incomplete PR state/);
  assert.equal(calls.length, 1);
});

for (const operation of ['GetPR', 'SyncContext', 'UpdateIssueStatus']) {
  for (const status of [401, 403, 404, 429, 500]) {
    test(`${operation} HTTP ${status} fails without exposing response content`, async () => {
      const { args } = fixture({ responses: { [operation]: json({ error: 'DO-NOT-LOG-fake-linear-key' }, status) } });
      await assert.rejects(syncLinearStatus(args), (error) => {
        assert.match(error.message, new RegExp(`HTTP ${status}`));
        assert.doesNotMatch(error.message, /DO-NOT-LOG|fake-linear-key/);
        return true;
      });
    });
  }
}

for (const operation of ['SyncContext', 'UpdateIssueStatus']) {
  test(`${operation}: HTTP 200 with GraphQL errors is a failure`, async () => {
    const { args } = fixture({ responses: { [operation]: json({ data: {}, errors: [{ message: 'fake-linear-key' }] }) } });
    await assert.rejects(syncLinearStatus(args), (error) => {
      assert.match(error.message, /GraphQL errors/);
      assert.doesNotMatch(error.message, /fake-linear-key/);
      return true;
    });
  });
  test(`${operation}: missing GraphQL data is a failure`, async () => {
    const { args } = fixture({ responses: { [operation]: json({ data: null }) } });
    await assert.rejects(syncLinearStatus(args), /no usable data/);
  });
}

test('network exceptions are reported without exposing their messages', async () => {
  const { args } = fixture({ responses: { SyncContext: () => { throw new Error('secret: fake-linear-key'); } } });
  await assert.rejects(syncLinearStatus(args), (error) => {
    assert.match(error.message, /failed or timed out/);
    assert.doesNotMatch(error.message, /fake-linear-key/);
    return true;
  });
});

test('malformed API JSON is a controlled failure', async () => {
  const { args } = fixture({ responses: { SyncContext: new Response('fake-linear-key') } });
  await assert.rejects(syncLinearStatus(args), /invalid JSON/);
});

for (const issueUpdate of [
  { success: false },
  { success: true, issue: { id: 'wrong-issue' } },
  { success: true, issue: { id: 'issue-uuid', state: { id: 'wrong-state', name: 'In Review' } } },
]) {
  test(`unconfirmed mutation fails: ${JSON.stringify(issueUpdate)}`, async () => {
    const { args } = fixture({ responses: { UpdateIssueStatus: json({ data: { issueUpdate } }) } });
    await assert.rejects(syncLinearStatus(args), /did not confirm/);
  });
}

test('CLI reports errors, exits nonzero, and writes an Actions summary without network access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'linear-sync-test-'));
  const eventPath = join(directory, 'event.json');
  const summaryPath = join(directory, 'summary.md');
  try {
    const { args } = fixture();
    await writeFile(eventPath, JSON.stringify(args.event));
    const scriptPath = fileURLToPath(new URL('./linear-status-sync.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_STEP_SUMMARY: summaryPath,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_REPOSITORY: REPOSITORY,
        GITHUB_TOKEN: '',
        LINEAR_API_KEY: 'DO-NOT-LOG',
      },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /::error::GITHUB_TOKEN is missing/);
    assert.doesNotMatch(result.stderr, /DO-NOT-LOG/);
    assert.match(await readFile(summaryPath, 'utf8'), /\*\*failed\*\*: GITHUB_TOKEN is missing/);
  } finally {
    await rm(eventPath, { force: true });
    await rm(summaryPath, { force: true });
    await rmdir(directory);
  }
});
