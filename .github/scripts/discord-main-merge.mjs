import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findIssueIds, linearRequest, requestJson, SyncError, UPDATE_MUTATION } from './linear-status-sync.mjs';

const SHA = /^[a-f0-9]{40,64}$/i;
const DISCORD_THREAD_ID = '1555581629072670781';
const DISCORD_GUILD_ID = '1547404099291447380';
const ISSUE_QUERY = `query NotificationIssue($issueId: String!) {
  organization { urlKey }
  issue(id: $issueId) {
    id identifier title url archivedAt state { id name } team { id key } assignee { name }
  }
}`;
const skip = (message) => ({ outcome: 'skipped', message });

export async function promoteIssues(issues, linearApiKey, fetchImpl) {
  if (!issues.length) return issues;
  const data = await linearRequest(fetchImpl, linearApiKey, 'ProdState', `query ProdState {
    organization { urlKey }
    workflowStates(filter: { team: { key: { eq: "OVE" } }, name: { eq: "Prod" } }, first: 2) {
      nodes { id name team { id key } }
    }
  }`, {});
  const states = data.workflowStates?.nodes;
  if (data.organization?.urlKey !== 'foro' || !Array.isArray(states) || states.length !== 1
      || states[0]?.name !== 'Prod' || !states[0].id || states[0].team?.key !== 'OVE'
      || !states[0].team?.id) throw new SyncError('Expected exactly one Prod status in the foro OVE team.');
  const target = states[0];
  // Validate the complete release before making the first write.
  for (const issue of issues) {
    if (!issue.id || !issue.state?.id || typeof issue.state.name !== 'string'
        || issue.team?.id !== target.team.id) throw new SyncError('Incomplete or mismatched OVE issue state; promotion stopped.');
  }
  const results = [];
  for (const issue of issues) {
    // Re-read immediately before writing to respect manual status changes.
    const latest = await linearRequest(fetchImpl, linearApiKey, 'NotificationIssue', ISSUE_QUERY, { issueId: issue.identifier });
    const current = latest.issue;
    if (latest.organization?.urlKey !== 'foro' || current?.id !== issue.id
        || current.identifier !== issue.identifier || current.team?.id !== target.team.id
        || current.team?.key !== 'OVE' || !current.state?.id || typeof current.state.name !== 'string') {
      throw new SyncError('Linear issue changed or became inaccessible during promotion. Rerun after checking the issue.');
    }
    let promotion = current.state.name === 'Prod' ? 'already-prod' : 'skipped';
    if (!current.archivedAt && current.state.name === 'QA') {
      const updated = await linearRequest(fetchImpl, linearApiKey, 'UpdateIssueStatus', UPDATE_MUTATION,
        { id: current.id, stateId: target.id });
      const result = updated.issueUpdate;
      if (result?.success !== true || result.issue?.id !== current.id
          || result.issue?.state?.id !== target.id || result.issue?.state?.name !== 'Prod') {
        throw new SyncError('Linear did not confirm QA -> Prod. Earlier issues may already be Prod; check and rerun.');
      }
      promotion = 'promoted';
      console.log(`updated: ${current.identifier}: QA -> Prod.`);
    }
    results.push({ ...issue, promotion, previousState: current.state.name });
  }
  return results;
}

export function webhookAddress(value) {
  if (!value?.trim()) throw new SyncError('DISCORD_WEBHOOK_URL is missing. Add the repository Actions secret.');
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || url.port
        || url.username || url.password || url.hash
        || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname)) throw new Error();
    for (const key of url.searchParams.keys()) {
      if (!['wait', 'thread_id'].includes(key)) throw new Error();
    }
    if (url.searchParams.getAll('thread_id').length !== 1
        || url.searchParams.get('thread_id') !== DISCORD_THREAD_ID) throw new Error();
    url.searchParams.set('wait', 'true');
    return url.href;
  } catch {
    throw new SyncError('DISCORD_WEBHOOK_URL must be a valid HTTPS discord.com incoming webhook URL with exactly one thread_id=1555581629072670781 for the configured forum post.');
  }
}

function branchIssueIds(branch) {
  const ids = findIssueIds(branch);
  if (ids.length > 1) throw new SyncError('An included branch contains multiple OVE identifiers. Use one issue per branch.');
  return ids;
}

// Traverse fixed commit snapshots, not moving branch names. A merge-commit
// release preserves ancestry so previous releases are excluded by GitHub.
export async function collectIssueIds(pr, get) {
  if (pr.head.ref !== 'dev') return branchIssueIds(pr.head.ref);
  if (!SHA.test(pr.merge_commit_sha ?? '')) throw new SyncError('The merged PR has no valid merge commit SHA.');
  const merge = await get(`/commits/${pr.merge_commit_sha}`);
  if (merge.sha !== pr.merge_commit_sha || merge.parents?.length !== 2
      || merge.parents.some((parent) => !SHA.test(parent.sha ?? ''))) {
    throw new SyncError('dev -> main requires Create a merge commit. Squash/rebase releases cannot be enumerated safely.');
  }
  const [base, head] = merge.parents.map((parent) => parent.sha);
  const commits = new Set();
  let total;
  for (let page = 1; ; page++) {
    if (page > 1000) throw new SyncError('The release exceeds the supported commit pagination limit.');
    const data = await get(`/compare/${base}...${head}?per_page=100&page=${page}`);
    if (!Array.isArray(data.commits) || !Number.isSafeInteger(data.total_commits) || data.total_commits < 0
        || (total !== undefined && total !== data.total_commits)) {
      throw new SyncError('GitHub returned an incomplete release comparison.');
    }
    total = data.total_commits;
    for (const commit of data.commits) {
      if (!SHA.test(commit.sha ?? '') || commits.has(commit.sha)) throw new SyncError('GitHub returned inconsistent release commits.');
      commits.add(commit.sha);
    }
    if (commits.size === total) break;
    if (!data.commits.length || commits.size > total) throw new SyncError('GitHub truncated the release comparison.');
  }

  const ids = new Set();
  for (let page = 1; ; page++) {
    if (page > 1000) throw new SyncError('The repository exceeds the supported PR pagination limit.');
    const prs = await get(`/pulls?state=closed&base=dev&per_page=100&page=${page}`);
    if (!Array.isArray(prs)) throw new SyncError('GitHub returned an invalid PR list.');
    for (const child of prs) {
      if (!child.merged_at || child.base?.ref !== 'dev' || !commits.has(child.merge_commit_sha)
          || child.head?.repo?.full_name !== pr.base.repo.full_name) continue;
      if (typeof child.head.ref !== 'string') throw new SyncError('GitHub returned an incomplete task branch.');
      for (const id of branchIssueIds(child.head.ref)) ids.add(id);
    }
    if (prs.length < 100) break;
  }
  return [...ids].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

function plain(value, limit) {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function markdown(value, limit) {
  return plain(value, limit).replace(/([\\`*_{}\[\]()<>~|])/g, '\\$1').replace(/@/g, '@\u200b');
}

export function buildMessages(pr, issues, repository) {
  let heading = `${issues.length} งาน • ${markdown(pr.head.ref, 100)} → main`;
  if (pr.head.ref === 'dev') {
    heading += `\nQA → Prod: ${issues.filter((issue) => issue.promotion === 'promoted').length} งาน`;
  }
  const lines = issues.map((issue) => {
    const link = issue.url.replace(/\(/g, '%28').replace(/\)/g, '%29');
    const status = issue.promotion === 'promoted' ? ' · QA → Prod'
      : issue.promotion === 'already-prod' ? ' · อยู่ Prod แล้ว'
        : issue.promotion === 'skipped' ? ` · ไม่ได้ย้าย (${markdown(issue.previousState, 80)})` : '';
    return `• [${issue.identifier}](${link}) ${markdown(issue.title, 300)} — ${markdown(issue.assignee?.name || 'ยังไม่ระบุ', 100)}${status}`;
  });
  if (!lines.length) lines.push('ไม่พบงาน OVE ที่เชื่อมกับ PR นี้');
  const descriptions = [];
  let description = heading;
  for (const line of lines) {
    if (`${description}\n${line}`.length > 3500) {
      descriptions.push(description);
      description = heading;
    }
    description += `\n${line}`;
  }
  descriptions.push(description);
  const thaiTime = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(pr.merged_at));
  return descriptions.map((text, index) => ({
    username: 'WANGAI Send Work Kub',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: '🚀 Merged to main', color: 0x2ecc71,
      url: `https://github.com/${repository}/pull/${pr.number}`,
      description: text,
      fields: [
        { name: 'Pull request', value: `[#${pr.number} ${markdown(pr.title, 150)}](https://github.com/${repository}/pull/${pr.number})` },
        { name: 'ผู้ merge', value: markdown(pr.merged_by?.login || 'ไม่ระบุ', 100), inline: true },
      ],
      footer: { text: `${thaiTime} (Asia/Bangkok) • ${index + 1}/${descriptions.length}` },
      timestamp: new Date(pr.merged_at).toISOString(),
    }],
  }));
}

export async function notifyMainMerge({ event, eventName, repository, githubToken, linearApiKey, webhookUrl, fetchImpl = globalThis.fetch }) {
  if (eventName !== 'pull_request' || event?.action !== 'closed'
      || event.pull_request?.merged !== true || event.pull_request?.base?.ref !== 'main') {
    return skip('Only merged PRs targeting main send Discord notifications.');
  }
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository ?? '') || event.repository?.full_name !== repository) {
    throw new SyncError('GITHUB_REPOSITORY does not match the event repository.');
  }
  if (event.pull_request.head?.repo?.full_name !== repository) return skip('Fork PRs are not supported.');
  const number = event.pull_request.number;
  if (!Number.isSafeInteger(number) || number <= 0) throw new SyncError('The event has no valid PR number.');
  if (!githubToken?.trim()) throw new SyncError('GITHUB_TOKEN is missing.');
  const webhook = webhookAddress(webhookUrl);
  // Read webhook metadata before any Linear mutation or Discord message. The
  // token stays in the request URL and is never included in logs or summaries.
  const metadataUrl = new URL(webhook);
  metadataUrl.search = '';
  const metadata = await requestJson(fetchImpl, metadataUrl.href, { method: 'GET' }, 'Discord');
  // Webhook metadata identifies the parent forum, not the destination thread.
  // Validate the guild here; Discord resolves thread membership on execution.
  if (metadata?.type !== 1 || metadata.guild_id !== DISCORD_GUILD_ID
      || typeof metadata.channel_id !== 'string' || !/^\d+$/.test(metadata.channel_id)
      || metadata.channel_id === DISCORD_THREAD_ID) {
    throw new SyncError('Discord webhook must belong to the configured server and a parent forum channel. No Linear update was attempted.');
  }
  const get = (path) => requestJson(fetchImpl, `https://api.github.com/repos/${repository}${path}`, {
    headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  }, 'GitHub');
  const pr = await get(`/pulls/${number}`);
  if (pr?.number !== number || !pr.merged || pr.state !== 'closed' || pr.base?.ref !== 'main'
      || pr.base?.repo?.full_name !== repository || pr.head?.repo?.full_name !== repository
      || typeof pr.head?.ref !== 'string' || !pr.merged_at || !Number.isFinite(Date.parse(pr.merged_at))) {
    throw new SyncError('GitHub did not confirm the expected merged PR.');
  }
  const ids = await collectIssueIds(pr, get);
  if (ids.length && !linearApiKey?.trim()) throw new SyncError('LINEAR_API_KEY is missing. Add the repository Actions secret.');
  const issues = [];
  // Complete collection and validation before sending the first message.
  for (const id of ids) {
    const data = await linearRequest(fetchImpl, linearApiKey, 'NotificationIssue', ISSUE_QUERY, { issueId: id });
    if (data.organization?.urlKey !== 'foro') throw new SyncError('LINEAR_API_KEY must belong to the foro workspace.');
    const issue = data.issue;
    if (issue?.identifier !== id || issue.team?.key !== 'OVE' || typeof issue.title !== 'string') {
      throw new SyncError('Linear returned a missing or mismatched OVE issue.');
    }
    // Bound URLs to keep each bullet inside the Discord embed limit.
    try {
      const url = new URL(issue.url);
      if (url.origin !== 'https://linear.app'
          || (!url.pathname.startsWith(`/foro/issue/${id}/`) && url.pathname !== `/foro/issue/${id}`)
          || url.username || url.password) throw new Error();
    } catch {
      throw new SyncError('Linear returned an invalid issue URL.');
    }
    issues.push({ ...issue, url: `https://linear.app/foro/issue/${id}` });
  }
  const releaseIssues = pr.head.ref === 'dev' ? await promoteIssues(issues, linearApiKey, fetchImpl) : issues;
  const messages = buildMessages(pr, releaseIssues, repository);
  let sent = 0;
  const deliveries = [];
  try {
    for (const payload of messages) {
      const response = await requestJson(fetchImpl, webhook, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }, 'Discord');
      if (typeof response?.id !== 'string' || !/^\d+$/.test(response.id)) throw new SyncError('Discord did not confirm a saved message.');
      if (response.channel_id !== DISCORD_THREAD_ID) throw new SyncError('Discord returned an unexpected destination thread. Check the webhook configuration.');
      deliveries.push({ messageId: response.id, channelId: response.channel_id });
      sent++;
    }
  } catch (error) {
    const detail = error instanceof SyncError ? error.message : 'Unexpected Discord response.';
    throw new SyncError(`${detail} Confirmed ${sent}/${messages.length} messages. A rerun may resend messages.`);
  }
  const promoted = releaseIssues.filter((issue) => issue.promotion === 'promoted').map((issue) => issue.identifier);
  const statusMessage = pr.head.ref === 'dev'
    ? `QA -> Prod: ${promoted.join(', ') || 'none'}. Already Prod: ${releaseIssues.filter((issue) => issue.promotion === 'already-prod').length}; preserved: ${releaseIssues.filter((issue) => issue.promotion === 'skipped').length}.`
    : 'Linear statuses were unchanged.';
  return { outcome: 'sent', message: `PR #${number}: ${issues.length} OVE issues, ${sent} Discord messages. ${statusMessage} Discord thread: ${DISCORD_THREAD_ID}; message IDs: ${deliveries.map((delivery) => delivery.messageId).join(', ')}.`, deliveries };
}

export async function main(env = process.env) {
  let result;
  try {
    let event;
    try { event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8')); }
    catch { throw new SyncError('Cannot read the GitHub event JSON from GITHUB_EVENT_PATH.'); }
    result = await notifyMainMerge({ event, eventName: env.GITHUB_EVENT_NAME, repository: env.GITHUB_REPOSITORY,
      githubToken: env.GITHUB_TOKEN, linearApiKey: env.LINEAR_API_KEY, webhookUrl: env.DISCORD_WEBHOOK_URL });
    console.log(`${result.outcome}: ${result.message}`);
  } catch (error) {
    result = { outcome: 'failed', message: error instanceof SyncError ? error.message : 'Unexpected Discord notification failure.' };
    console.error(`::error::${result.message}`);
    process.exitCode = 1;
  }
  if (env.GITHUB_STEP_SUMMARY) {
    try { await appendFile(env.GITHUB_STEP_SUMMARY, `## Discord main merge\n\n**${result.outcome}**: ${result.message}\n`); }
    catch { console.error('::warning::Could not write the Actions summary. See the step log.'); }
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
