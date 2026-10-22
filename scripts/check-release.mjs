const help = 'node scripts/check-release.mjs <https-origin|http-loopback-origin> <full-commit-sha>';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log(`usage: ${help}\nChecks release identity, database health, and the public page. Read-only; each request times out after 10 seconds.`);
} else {
  let origin;
  try {
    origin = new URL(args[0]);
    if (args.length !== 2 || !/^[a-f0-9]{40}$/.test(args[1]) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
      !(origin.protocol === 'https:' || (origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) throw new Error();
  } catch {
    console.log(`error: supply an HTTPS origin or HTTP loopback origin and a full commit SHA\nhelp: ${help}`);
    process.exit(2);
  }
  try {
    async function get(route) {
      const response = await fetch(new URL(route, origin), { signal: AbortSignal.timeout(10_000), redirect: 'error', cache: 'no-store' });
      if (response.status !== 200) throw new Error();
      return response;
    }
    const release = await (await get('/api/release')).json();
    if (release.revision !== args[1] || release.modified !== false) throw new Error();
    const health = await (await get('/api/health')).json();
    if (health.ok !== true) throw new Error();
    const page = await get('/');
    if (!page.headers.get('content-type')?.includes('text/html') || !(await page.text()).includes('<div id="root">')) throw new Error();
    console.log(`release: ${release.revision}\nchecks: passed`);
  } catch {
    console.log('error: release identity, database health, or public page check failed\nhelp: inspect the target release and service logs; do not treat this revision as deployed');
    process.exitCode = 1;
  }
}
