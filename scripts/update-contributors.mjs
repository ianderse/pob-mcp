import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const START = '<!-- readme: collaborators,contributors -start -->';
const END = '<!-- readme: collaborators,contributors -end -->';
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export function contributorAccounts(contributors, pulls) {
  const accounts = new Map();
  for (const user of [...contributors, ...pulls.filter(pr => pr.merged_at).map(pr => pr.user)]) {
    if (user?.type === 'User' && user.login) accounts.set(user.login.toLowerCase(), user);
  }
  return [...accounts.values()];
}

export function replaceContributors(readme, profiles) {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END, start + START.length);
  if (start === -1 || end === -1 || !profiles.length) throw new Error('Missing contributors markers or contributor profiles');
  const rows = [];
  for (let offset = 0; offset < profiles.length; offset += 6) {
    const cells = profiles.slice(offset, offset + 6).map(user =>
      `      <td align="center"><a href="${escapeHtml(user.html_url)}">` +
      `<img src="${escapeHtml(user.avatar_url)}" width="100" alt="${escapeHtml(user.login)}"/>` +
      `<br /><sub><b>${escapeHtml(user.name || user.login)}</b></sub></a></td>`);
    rows.push(['    <tr>', ...cells, '    </tr>'].join('\n'));
  }
  const table = ['<table>', '  <tbody>', ...rows, '  </tbody>', '</table>'].join('\n');
  return readme.slice(0, start + START.length) + '\n' + table + '\n' + readme.slice(end);
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY || 'ianderse/pob-mcp';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid GITHUB_REPOSITORY');
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const request = async path => {
    const response = await fetch(`https://api.github.com/${path}`, { headers });
    if (!response.ok) throw new Error(`GitHub ${response.status} for ${path}`);
    return response.json();
  };
  const pages = async path => {
    const entries = [];
    for (let page = 1; ; page++) {
      const batch = await request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      entries.push(...batch);
      if (batch.length < 100) return entries;
    }
  };
  // Contributor statistics can lag new merges and omit authors with unlinked commit emails.
  const [contributors, pulls] = await Promise.all([
    pages(`repos/${repository}/contributors`), pages(`repos/${repository}/pulls?state=closed`),
  ]);
  const accounts = contributorAccounts(contributors, pulls);
  const profiles = await Promise.all(accounts.map(user => request(`users/${encodeURIComponent(user.login)}`)));
  const path = new URL('../README.md', import.meta.url);
  const before = await readFile(path, 'utf8');
  const after = replaceContributors(before, profiles);
  if (after !== before) await writeFile(path, after);
  console.log(`Contributors verified: ${profiles.map(user => user.login).join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
