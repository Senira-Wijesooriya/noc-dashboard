/** Unit tests: run with `npm test` after npm ci. No Redis, Gmail or network required. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  const tsSource = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const js = ts.transpileModule(tsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX }}).outputText;
  const exports = {};
  const module = { exports };
  const fakeRequire = (id) => id in mocks ? mocks[id] : require(id);
  vm.runInNewContext(js, { module, exports, require: fakeRequire, console, process, Buffer, setTimeout, clearTimeout, AbortSignal, fetch, Date, URL, structuredClone, ...globals }, { filename: file });
  return module.exports;
}
const versionMock = { CP_VERSIONS: [{ id: 'R81.20' }, { id: 'R82' }, { id: 'R82.10' }, { id: 'R82.20' }], VERSION_IDS: [], DEFAULT_VERSION: 'R81.20' };
const { parseLatestTake } = load('lib/checkpoint.ts', { '@/lib/versions': versionMock });
const takes = load('lib/takes.ts');
const { buildRows, buildCsv, buildReportHtml } = load('lib/report.ts', { '@/lib/versions': versionMock, '@/lib/takes': takes });
const { diffOne, undo } = load('app/api/dashboard/route.ts', {
  'next/server': { NextResponse: { json: (x) => x } },
  '@/lib/redis': { default: {} }, '@/lib/versions': versionMock,
  '@/lib/checkpoint': { fetchLatestTakes: () => ({ takes: [], errors: {} }) },
  '@/lib/security': {},
});
const security = load('lib/security.ts', { 'next/headers': { cookies: () => ({}) }, '@/lib/redis': { default: {} } });

const c1 = { id: 'c1', name: 'Company', clusters: [] };
const a1 = { id: 'a1', name: 'Gateway', model: 'Quantum 9200', version: 'R82.10', hotfix: 'Take 22', clusterType: 'Single GW', status: 'Ready', note: '' };
test('latest Take parser ignores previously released Takes, appliance base takes and scripts', () => {
  assert.equal(parseLatestTake('<script>Take 999 - Latest</script><h1>Take 173 - Wide Adoption</h1><h2>Previously Released Takes</h2>Take 170'), 173);
  assert.equal(parseLatestTake('<h1>Take 52 - Initial Adoption</h1>R82.10 Take 467 firmware<br>Previously Released Takes Take 50'), 52);
  assert.equal(parseLatestTake('<h1>Take 10 - Initial Adoption</h1>'), 10);
  assert.equal(parseLatestTake('R82.10 Take 467 firmware but no Jumbo heading'), null);
});
test('one-change diff: add, delete, asset edit, and reject multiple edits', () => {
  assert.equal(diffOne([], [c1]).kind, 'add_client');
  assert.equal(diffOne([c1], []).kind, 'delete_client');
  const before = [{...c1, clusters: [a1]}];
  const after = [{...c1, clusters: [{ ...a1, hotfix: 'Take 50' }]}];
  const e = diffOne(before, after);
  assert.equal(e.kind, 'edit_cluster');
  assert.equal(e.before.hotfix, 'Take 22');
  assert.equal(e.after.hotfix, 'Take 50');
  assert.equal(diffOne([c1, { ...c1, id: 'c2' }], []), null);
});
test('recycle undo restores edited asset only if newer changes have not superseded it', () => {
  const before = [{ ...c1, clusters: [a1] }];
  const after = [{ ...c1, clusters: [{...a1, hotfix: 'Take 50'}] }];
  const entry = { ...diffOne(before, after), id: 'r1', restoredAt: null };
  const restored = undo(after, entry);
  assert.equal(restored.list[0].clusters[0].hotfix, 'Take 22');
  const newer = [{...c1, clusters: [{ ...a1, hotfix: 'Take 52' }]}];
  assert.match(undo(newer, entry).error, /newer edits/);
});
test('newly deleted client and asset can be recovered with original data', () => {
  const removedClient = diffOne([c1], []);
  assert.equal(undo([], removedClient).list[0].name, 'Company');
  const withAsset = [{ ...c1, clusters: [a1] }];
  const withoutAsset = [{ ...c1, clusters: [] }];
  const removed = diffOne(withAsset, withoutAsset);
  assert.equal(undo(withoutAsset, removed).list[0].clusters[0].name, 'Gateway');
});
test('installed Take parser ignores appliance base builds and unlabelled strings', () => {
  assert.equal(takes.installedTake('Take 52'), 52);
  assert.equal(takes.installedTake('R82.10 Take 52'), 52);
  assert.equal(takes.installedTake('R82.10 Build 467'), null);
  assert.equal(takes.installedTake('Take 52 + Special HF'), 52);
});
test('report supports one client or all, stale sources become unknown, and HTML is escaped', () => {
  const customers = [{ id: 'c1', name: '<script>alert(1)</script>', clusters: [a1] }, { id: 'c2', name: 'Other', clusters: [{...a1, id:'a2', hotfix:'Take 52'}] }];
  const targets = { 'R82.10': '52' };
  const rows = buildRows(customers, targets);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].gap, 30);
  assert.equal(rows[1].compliance, 'Up to date');
  assert.equal(buildRows(customers.slice(0, 1), targets).length, 1);
  assert.equal(buildRows(customers, targets, { 'R82.10': 'Offline' })[0].compliance, 'Unknown');
  assert.ok(buildCsv(rows).startsWith('\ufeff'));
  const html = buildReportHtml({ rows, targets, scopeLabel:'Test', generatedBy: 'tester@mitesp.com', logoUrl:'/logo.png' });
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
});
test('email verification only accepts exact company domain; OTP hashing is deterministic', () => {
  process.env.OTP_HASH_SECRET = '1234567890abcdefghijklmnopqrstuvwxy';
  assert.equal(security.companyEmail('PERSON@MITESP.COM '), 'person@mitesp.com');
  assert.equal(security.companyEmail('person@mitesp.com.evil.test'), null);
  assert.equal(security.companyEmail('person@gmail.com'), null);
  delete process.env.SHIPYARD_ALLOWED_EMAILS;
  assert.equal(security.emailAllowed('person@mitesp.com'), false);
  process.env.SHIPYARD_ALLOWED_EMAILS = 'person@mitesp.com';
  assert.equal(security.emailAllowed('person@mitesp.com'), true);
  assert.equal(security.otpHash('person@mitesp.com', '123456').length, 64);
  assert.notEqual(security.otpHash('person@mitesp.com', '123456'), security.otpHash('person@mitesp.com', '123457'));
});
test('every project TypeScript file parses', () => {
  function walk(dir) {
    for (const p of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, p.name);
      if (p.isDirectory()) walk(f);
      else if (/\.tsx?$/.test(f)) {
        const source = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        assert.equal(source.parseDiagnostics.length, 0, f);
      }
    }
  }
  walk(path.join(__dirname, '..', 'app')); walk(path.join(__dirname, '..', 'lib'));
});


test('dashboard API enforces sessions, attributes audit to verified user, blocks stale updates and undoes safely', async () => {
  const mem = new Map();
  const unpack = (x) => x == null ? null : (typeof x === 'string' && (x.startsWith('[') || x.startsWith('{'))) ? JSON.parse(x) : x;
  mem.set('settings:targets_last_attempt', Date.now());
  const kv = {
    get: async (k) => unpack(mem.get(k)),
    hgetall: async (k) => mem.get(k) || {},
    eval: async (_script, keys, args) => {
      const rev = Number(mem.get(keys[0]) || 0);
      if (rev !== Number(args[0])) return 0;
      for (let i=1;i<keys.length;i++) mem.set(keys[i], args[i]);
      mem.set(keys[0], rev+1);
      return 1;
    },
  };
  let loggedIn = false;
  const route = load('app/api/dashboard/route.ts', {
    'next/server': { NextResponse: { json: (body, options={}) => ({ body, status: options.status || 200 }) } },
    '@/lib/redis': { __esModule: true, default: kv }, '@/lib/versions': versionMock,
    '@/lib/checkpoint': { fetchLatestTakes: () => ({ takes: [], errors: {} }) },
    '@/lib/security': { getSession: () => loggedIn ? { email: 'verified@mitesp.com', name: 'VERIFIED' } : null, isSameOrigin: () => true, requesterIp: () => '203.0.113.3' },
  });
  const request = (body) => new Request('https://shipyard.example/api/dashboard', {
    method:'POST', headers: { 'content-type':'application/json', origin:'https://shipyard.example' }, body: JSON.stringify(body),
  });
  assert.equal((await route.GET()).status, 401);
  assert.equal((await route.POST(request({action:'update_customers', customers:[c1], revision:0}))).status, 401);
  loggedIn = true;
  const saved = await route.POST(request({action:'update_customers', customers:[c1], revision:0, userEmail:'forged@mitesp.com', ipAddress:'10.10.10.10'}));
  assert.equal(saved.status, 200);
  assert.equal(saved.body.logs[0].userEmail, 'verified@mitesp.com');
  assert.equal(saved.body.logs[0].ipAddress, '203.0.113.3');
  assert.equal(saved.body.revision, 1);
  assert.equal((await route.POST(request({action:'update_customers', customers:[], revision:0}))).status, 409);
  const undone = await route.POST(request({action:'restore_item', entryId:saved.body.recycle[0].id }));
  assert.equal(undone.status, 200);
  assert.equal(undone.body.customers.length, 0);
  assert.equal(undone.body.recycle[0].restoredBy, 'verified@mitesp.com');
});

test('OTP email flow sends a code, rejects a wrong code and creates server session on correct code', async () => {
  const mem = new Map();
  let outgoingMessage = '';
  process.env.GMAIL_SENDER_EMAIL = 'shipyard.secure.login@gmail.com';
  process.env.GMAIL_APP_PASSWORD = 'abcdefghijklmnop';
  process.env.OTP_HASH_SECRET = '0123456789abcdefghij0123456789abcdefghij';
  process.env.SHIPYARD_ALLOWED_EMAILS = 'verified@mitesp.com';
  const kv = {
    get: async (key) => mem.get(key) || null,
    set: async (key, value, options={}) => {
      if (options.nx && mem.has(key)) return null;
      mem.set(key,value); return 'OK';
    },
    incr: async (key) => { const n=Number(mem.get(key)||0)+1;mem.set(key,n);return n; },
    expire: async () => 1,
    del: async (...keys) => { keys.forEach((key)=>mem.delete(key)); return keys.length; },
    eval: async (_script, keys, args) => {
      const data = JSON.parse(mem.get(keys[0]) || 'null');
      if (!data) return 0;
      if (data.digest===args[0]) { mem.delete(keys[0]); return 1; }
      data.attempts++; if (data.attempts>=5) mem.delete(keys[0]); else mem.set(keys[0],JSON.stringify(data)); return -1;
    },
  };
  const sec = { ...security, getSession: async () => null, isSameOrigin: () => true, requesterIp: () => '203.0.113.3' };
  const route = load('app/api/auth/route.ts', {
    'next/server': { NextResponse: { json: (body, options={}) => ({ body, status: options.status || 200, cookies: { set: (name,value) => { mem.set('cookie:'+name,value); } } }) } },
    '@/lib/redis': { __esModule: true, default: kv }, '@/lib/security': sec,
    '@/lib/mailer': { gmailConfigured: () => true, sendOtpEmail: async (_to, code) => { outgoingMessage = `Your code is ${code}`; } },
  });
  const request = (body) => new Request('https://shipyard.example/api/auth', {
    method:'POST', headers:{origin:'https://shipyard.example', 'content-type':'application/json'}, body:JSON.stringify(body)
  });
  assert.equal((await route.POST(request({action:'request_code', email:'attacker@not-mitesp.com'}))).status,400);
  const requested = await route.POST(request({action:'request_code', email:'verified@mitesp.com'}));
  assert.equal(requested.status, 200);
  const code = outgoingMessage.match(/code is (\d{6})/)[1];
  assert.equal((await route.POST(request({action:'verify_code',email:'verified@mitesp.com',code:'abcdef'}))).status,400);
  const verified = await route.POST(request({action:'verify_code',email:'verified@mitesp.com',code}));
  assert.equal(verified.status,200);
  assert.equal(verified.body.user.email,'verified@mitesp.com');
  assert.ok(mem.get('cookie:shipyard_session'));
  assert.equal((await route.POST(request({action:'verify_code',email:'verified@mitesp.com',code}))).status,401);
});


test('Gmail mailer requires its designated sender and a 16-character App Password', async () => {
  let envelope;
  const mailer = load('lib/mailer.ts', {
    nodemailer: { createTransport: (config) => {
      assert.equal(config.host, 'smtp.gmail.com');
      assert.equal(config.port, 465);
      assert.equal(config.secure, true);
      return { sendMail: async (message) => { envelope = message; return { accepted: [message.to], rejected: [] }; } };
    } },
  });
  process.env.GMAIL_SENDER_EMAIL = 'shipyard.secure.login@gmail.com';
  process.env.GMAIL_APP_PASSWORD = 'abcdefghijklmnop';
  assert.equal(mailer.gmailConfigured(), true);
  await mailer.sendOtpEmail('person@mitesp.com', '123456');
  assert.equal(envelope.to, 'person@mitesp.com');
  assert.match(envelope.text, /123456/);
  await assert.rejects(() => mailer.sendOtpEmail('person@gmail.com', '123456'), /Invalid verification recipient/);
  process.env.GMAIL_APP_PASSWORD = 'invalid';
  assert.equal(mailer.gmailConfigured(), false);
});
