#!/usr/bin/env node
// probe-redteam.mjs — probes de navegador do pentest AUTORIZADO (próprio local/dev).
// Uso: WC_HOST=http://localhost:3000 USER_BAIXO=.. PASS_BAIXO=.. node probe-redteam.mjs
// NÃO rodar em produção. Sem DoS. PoC mínimo. Sem segredo no output.
import playwright from '@playwright/test';
const { chromium } = playwright;
const HOST = process.env.WC_HOST ?? 'http://localhost:3000';
const achados = [];
const add = (id, brecha, vuln, detalhe) => achados.push({ id, brecha, vuln, detalhe });

const browser = await chromium.launch();
const page = await browser.newContext().then((c) => c.newPage());
try {
  // login com perfil de BAIXO privilégio (adapte rota/seletores)
  await page.goto(`${HOST}/auth/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', process.env.USER_BAIXO ?? '');
  await page.fill('input[type="password"]', process.env.PASS_BAIXO ?? '');
  await Promise.all([page.waitForLoadState('networkidle'), page.click('button[type="submit"]')]);

  // T1 — token vazando no client (PageData/HTML/bundle)
  const html = await page.content();
  const vaza = /Bearer\s|accessToken|refreshToken|eyJ[A-Za-z0-9_-]{10,}\./.test(html);
  add('T1', 'token exposto', vaza, vaza ? 'JWT/Bearer encontrado no documento' : 'limpo');

  // T9 — flags do cookie de sessão
  const cookies = await page.context().cookies();
  const sess = cookies.find((c) => /sess|sid|token/i.test(c.name));
  const fraco = sess && !(sess.httpOnly && sess.secure);
  add('T9', 'cookie de sessão', !!fraco, sess ? `httpOnly=${sess.httpOnly} secure=${sess.secure} sameSite=${sess.sameSite}` : 'sem cookie de sessão');

  // T2 — Bearer forjado num endpoint protegido → deve 401/403
  const r2 = await page.request.get(`${HOST}/api/${process.env.REC ?? '<recurso>'}`, { headers: { Authorization: 'Bearer dev-mock-token' } });
  add('T2', 'bypass de auth (Bearer forjado)', r2.status() < 400, `status=${r2.status()} (esperado 401/403)`);

  // T3 — IDOR: acessar id de outro tenant/usuário (adapte IDs)
  const idAlheio = process.env.ID_ALHEIO;
  if (idAlheio) {
    const r3 = await page.request.get(`${HOST}/api/${process.env.REC ?? '<recurso>'}/${idAlheio}`);
    add('T3', 'IDOR', r3.status() < 400, `status=${r3.status()} acessando id alheio (esperado 403/404)`);
  }
} finally {
  await browser.close();
}

let crit = 0;
for (const a of achados) {
  if (a.vuln) crit++;
  console.log(`${a.vuln ? '🛑 VULN' : '✅ ok  '} [${a.id}] ${a.brecha} — ${a.detalhe}`);
}
console.log(`\n${crit === 0 ? '✅ nenhuma brecha nestes probes' : `🛑 ${crit} brecha(s) — gerar achado com PoC+remediação`}`);
process.exit(crit === 0 ? 0 : 1);
