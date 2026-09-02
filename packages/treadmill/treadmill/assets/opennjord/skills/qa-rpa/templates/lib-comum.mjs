// lib-comum.mjs — helpers do harness de RPA (genérico). Adapte ao projeto.
import playwright from '@playwright/test'; // ou caminho relativo p/ node_modules
const { chromium } = playwright;

export const HOST = process.env.WC_HOST ?? 'http://localhost:3000';

// credenciais por perfil (do cofre de secrets — NUNCA hardcode segredo real aqui)
export function cred(perfil) {
  const u = process.env[`USER_${perfil}`];
  const p = process.env[`PASS_${perfil}`];
  if (!u || !p) throw new Error(`Faltam USER_${perfil}/PASS_${perfil} no ambiente`);
  return { user: u, pass: p };
}

// abre um browser + faz login real pela tela (adapte os seletores/rota de login)
export async function abrirSessao(perfil = 'ADM') {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const { user, pass } = cred(perfil);
  const resp = await page.goto(`${HOST}/auth/login`, { waitUntil: 'networkidle' });
  if (!resp || resp.status() >= 400) throw new Error(`login GET ${resp?.status()}`);
  await page.fill('input[name="email"], input[type="email"]', user);
  await page.fill('input[name="password"], input[type="password"]', pass);
  await Promise.all([page.waitForLoadState('networkidle'), page.click('button[type="submit"]')]);
  return { browser, ctx, page };
}

// navega a uma tela e captura status do DOCUMENTO + console + marcador
export async function abrirTela(page, path, marcador) {
  const erros = [];
  const onErr = (m) => { if (m.type() === 'error') erros.push(m.text()); };
  page.on('console', onErr);
  const resp = await page.goto(`${HOST}${path}`, { waitUntil: 'networkidle' });
  const status = resp ? resp.status() : 0;
  const html = await page.content();
  const temMarcador = marcador ? marcador.test(html) : true;
  // anti-vazamento de token no client (PageData/HTML/bundle)
  const vazaToken = /Bearer\s|accessToken|eyJ[A-Za-z0-9_-]{10,}\./.test(html);
  page.off('console', onErr);
  return { status, temMarcador, erros, vazaToken };
}

// bate no endpoint da BFF/back e confere o envelope + 0 token
export async function checarBack(page, endpoint, envelopeKey = 'data') {
  const r = await page.request.get(`${HOST}${endpoint}`);
  const status = r.status();
  let json = null; try { json = await r.json(); } catch {}
  const txt = json ? JSON.stringify(json) : await r.text();
  return {
    status,
    envelopeOk: !!json && Object.prototype.hasOwnProperty.call(json, envelopeKey),
    vazaToken: /Bearer\s|accessToken|eyJ[A-Za-z0-9_-]{10,}\./.test(txt),
  };
}

export function reporta(linhas) {
  const falhas = linhas.filter((l) => !l.ok).length;
  for (const l of linhas) console.log(`${l.ok ? '✅' : '❌'} ${l.nome}${l.detalhe ? ' — ' + l.detalhe : ''}`);
  console.log(`\n${falhas === 0 ? '✅ TODAS PASSARAM' : `❌ ${falhas} FALHA(S)`}`);
  return falhas === 0 ? 0 : 1;
}
