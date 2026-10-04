import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEAM = 'OVE';
const WORKSPACE = 'foro';
const TARGET_BRANCH = 'dev';
const ACTIONS = new Set([
  'opened', 'reopened', 'ready_for_review', 'synchronize', 'edited', 'closed',
]);

// Only these controlled messages may be written to logs. Never log API response
// bodies, request headers, or underlying fetch errors, which can contain secrets.
export class SyncError extends Error {}

export const CONTEXT_QUERY = `
  query SyncContext($issueId: String!, $filter: WorkflowStateFilter!) {
    organization { urlKey }
    issue(id: $issueId) {
      id
      identifier
      archivedAt
      state { id name }
      team { id key }
    }
    workflowStates(filter: $filter, first: 2) {
      nodes { id name team { id key } }
    }
  }
`;

export const UPDATE_MUTATION = `
  mutation UpdateIssueStatus($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: { stateId: $stateId }) {
      success
      issue { id state { id name } }
    }
  }
`;

const skipped = (message) => ({ outcome: 'skipped', message });

export function findIssueIds(branch) {
  // Accept Linear's username/ove-123-title format and custom prefixes, while
  // rejecting partial identifiers such as XOVE-123 or OVE-123abc.
  return [...new Set(
    [...branch.matchAll(/(?<![a-z0-9])OVE-\d+(?![a-z0-9])/gi)]
      .map(([identifier]) => identifier.toUpperCase()),
  )];
}

export function planPullRequest(pr, repository) {
  if (pr.base?.ref !== TARGET_BRANCH) {
    return skipped('The PR does not target dev.');
  }
  if (pr.base?.repo?.full_name !== repository || pr.head?.repo?.full_name !== repository) {
    return skipped('Only branches in this repository are supported; fork or deleted repositories are skipped.');
  }
  if (typeof pr.head?.ref !== 'string' || typeof pr.merged !== 'boolean'
      || typeof pr.draft !== 'boolean' || !['open', 'closed'].includes(pr.state)) {
    throw new SyncError('GitHub returned incomplete PR state; no update was attempted.');
  }

  const ids = findIssueIds(pr.head.ref);
  if (ids.length === 0) return skipped('The branch contains no OVE issue identifier.');
  if (ids.length > 1) return skipped('The branch contains multiple OVE issue identifiers; select one issue per branch.');
  if (pr.merged) {
    return { issueId: ids[0], target: 'QA', sources: ['In Progress', 'In Review'] };
  }
  if (pr.state === 'closed') return skipped('The PR was closed without merging.');
  if (pr.draft) return skipped('The PR is a draft; wait until it is ready for review.');
  return { issueId: ids[0], target: 'In Review', sources: ['In Progress'] };
}

export async function requestJson(fetchImpl, url, options, service) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SyncError(`${service} request failed or timed out. Check connectivity and rerun the workflow.`);
  }
  if (!response.ok) {
    const hints = {
      401: 'Check the configured API token.',
      403: 'Check the API token permissions and resource access.',
      404: 'Check that the resource exists and is accessible to the API token.',
      429: 'The API rate limit was reached. Wait and rerun the workflow.',
    };
    const status = Number.isInteger(response.status) ? response.status : 'error';
    throw new SyncError(`${service} returned HTTP ${status}. ${hints[status] ?? 'Check the service and rerun the workflow.'}`);
  }
  try {
    return await response.json();
  } catch {
    throw new SyncError(`${service} returned invalid JSON. Rerun the workflow after checking the service.`);
  }
}

export async function linearRequest(fetchImpl, apiKey, operationName, query, variables) {
  const body = await requestJson(fetchImpl, 'https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationName, query, variables }),
  }, 'Linear');
  if (body?.errors && (!Array.isArray(body.errors) || body.errors.length > 0)) {
    throw new SyncError(`Linear ${operationName} returned GraphQL errors. Check OVE issue access, key permissions, and the query schema.`);
  }
  if (!body?.data || typeof body.data !== 'object') {
    throw new SyncError(`Linear ${operationName} returned no usable data.`);
  }
  return body.data;
}

export async function syncLinearStatus({
  event,
  eventName,
  repository,
  githubToken,
  linearApiKey,
  fetchImpl = globalThis.fetch,
}) {
  if (eventName !== 'pull_request' || !ACTIONS.has(event?.action)) {
    return skipped('This event is not supported by the Linear sync workflow.');
  }
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository ?? '')
      || event.repository?.full_name !== repository) {
    throw new SyncError('GITHUB_REPOSITORY does not match the event repository.');
  }
  // Gate untrusted forks before accessing either API, even if run outside Actions.
  if (event.pull_request?.head?.repo?.full_name !== repository) {
    return skipped('Only branches in this repository are supported; fork or deleted repositories are skipped.');
  }
  const number = event.pull_request?.number;
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new SyncError('The event does not contain a valid pull request number.');
  }
  if (!githubToken?.trim()) throw new SyncError('GITHUB_TOKEN is missing. Provide the workflow GitHub token.');

  // Reconcile from live PR state, never the possibly stale event payload.
  const pr = await requestJson(fetchImpl, `https://api.github.com/repos/${repository}/pulls/${number}`, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  }, 'GitHub');
  if (!pr || pr.number !== number) throw new SyncError('GitHub returned an unexpected pull request.');
  const plan = planPullRequest(pr, repository);
  if (plan.outcome === 'skipped') return plan;
  if (!linearApiKey?.trim()) {
    throw new SyncError('LINEAR_API_KEY is missing. Add it under repository Settings > Secrets and variables > Actions.');
  }

  // Reading issue state and the target in one query keeps the final read close
  // to the update. Linear does not offer an atomic conditional state update;
  // do not race a manual drag with this job or enable competing automations.
  const context = await linearRequest(fetchImpl, linearApiKey, 'SyncContext', CONTEXT_QUERY, {
    issueId: plan.issueId,
    filter: { team: { key: { eq: TEAM } }, name: { eq: plan.target } },
  });
  if (context.organization?.urlKey !== WORKSPACE) {
    throw new SyncError('LINEAR_API_KEY must belong to the foro workspace.');
  }
  const issue = context.issue;
  if (!issue?.id) throw new SyncError(`${plan.issueId} was not found. Check the identifier and API key access.`);
  if (issue.identifier !== plan.issueId || issue.team?.key !== TEAM || !issue.team?.id) {
    throw new SyncError('The Linear issue does not match the expected OVE team and identifier.');
  }
  if (issue.archivedAt) return skipped(`${plan.issueId} is archived; its status is preserved.`);
  if (!issue.state?.id || typeof issue.state.name !== 'string') {
    throw new SyncError('Linear returned an issue without a usable current status.');
  }
  if (!plan.sources.includes(issue.state.name)) {
    return skipped(`${plan.issueId}: the current status is not eligible for this transition and is preserved.`);
  }

  const states = context.workflowStates?.nodes;
  if (!Array.isArray(states) || states.length !== 1) {
    throw new SyncError(`Expected exactly one OVE status named "${plan.target}". Check the team's workflow settings.`);
  }
  const target = states[0];
  if (!target?.id || target.name !== plan.target || target.team?.id !== issue.team.id
      || target.team?.key !== TEAM) {
    throw new SyncError('Linear returned a target status that does not belong to the expected OVE team.');
  }
  const updated = await linearRequest(fetchImpl, linearApiKey, 'UpdateIssueStatus', UPDATE_MUTATION, {
    id: issue.id,
    stateId: target.id,
  });
  const result = updated.issueUpdate;
  if (result?.success !== true || result.issue?.id !== issue.id
      || result.issue?.state?.id !== target.id || result.issue?.state?.name !== plan.target) {
    throw new SyncError('Linear did not confirm the requested status update. Check the issue before rerunning the workflow.');
  }
  return { outcome: 'updated', message: `${plan.issueId}: ${issue.state.name} -> ${plan.target}.` };
}

export async function main(env = process.env) {
  let result;
  try {
    let event;
    try {
      event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
    } catch {
      throw new SyncError('Cannot read the GitHub event JSON from GITHUB_EVENT_PATH.');
    }
    result = await syncLinearStatus({
      event,
      eventName: env.GITHUB_EVENT_NAME,
      repository: env.GITHUB_REPOSITORY,
      githubToken: env.GITHUB_TOKEN,
      linearApiKey: env.LINEAR_API_KEY,
    });
    console.log(`${result.outcome}: ${result.message}`);
  } catch (error) {
    const message = error instanceof SyncError
      ? error.message
      : 'Unexpected Linear sync failure. Check the workflow configuration and script.';
    result = { outcome: 'failed', message };
    console.error(`::error::${message}`);
    process.exitCode = 1;
  }
  if (env.GITHUB_STEP_SUMMARY) {
    try {
      await appendFile(env.GITHUB_STEP_SUMMARY, `## Linear status sync\n\n**${result.outcome}**: ${result.message}\n`);
    } catch {
      console.error('::warning::Could not write the GitHub Actions step summary. See the step log.');
    }
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
