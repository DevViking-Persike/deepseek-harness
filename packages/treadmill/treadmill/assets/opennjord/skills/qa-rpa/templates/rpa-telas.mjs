#!/usr/bin/env node
// rpa-telas.mjs — RPA que valida o FLUXO de cada tela (front + back) por perfil.
// Uso: WC_HOST=https://<host> USER_ADM=.. PASS_ADM=.. node rpa-telas.mjs [PERFIL]
// Adapte a MATRIZ ao seu projeto (todas as rotas de todos os fronts).
import { abrirSessao, abrirTela, checarBack, reporta } from './lib-comum.mjs';

// path = rota da tela · perfilMin = perfil mínimo · marcador = regex do conteúdo
// esperado · back = endpoint da BFF/API por trás (opcional) · acao = fn(page) opcional
const MATRIZ = [
  { path: '/dashboard',         marcador: /Dashboard|Início/i,   back: '/api/dashboard' },
  { path: '/<recurso>',         marcador: /<Título da tela>/i,   back: '/api/<recurso>?page=1' },
  { path: '/<recurso>/<id>',    marcador: /<Detalhe>/i,          back: '/api/<recurso>/<id>' },
  // ... cobrir TODAS as telas/etapas de TODOS os fronts (índice + detalhe + ação)
];

const PERFIL = process.argv[2] ?? 'ADM';

const { browser, page } = await abrirSessao(PERFIL);
const linhas = [];
try {
  for (const tela of MATRIZ) {
    // FRONT
    const f = await abrirTela(page, tela.path, tela.marcador);
    linhas.push({ nome: `front ${tela.path} [${PERFIL}]`,
      ok: f.status < 400 && f.temMarcador && f.erros.length === 0 && !f.vazaToken,
      detalhe: `status=${f.status} marcador=${f.temMarcador} console=${f.erros.length} token=${f.vazaToken}` });

    // BACK (envelope + 0 token)
    if (tela.back) {
      const b = await checarBack(page, tela.back);
      linhas.push({ nome: `back  ${tela.back} [${PERFIL}]`,
        ok: b.status < 400 && b.envelopeOk && !b.vazaToken,
        detalhe: `status=${b.status} envelope=${b.envelopeOk} token=${b.vazaToken}` });
    }

    // FLUXO (ação), se houver
    if (tela.acao) {
      const r = await tela.acao(page).then(() => ({ ok: true })).catch((e) => ({ ok: false, e: e.message }));
      linhas.push({ nome: `fluxo ${tela.path} [${PERFIL}]`, ok: r.ok, detalhe: r.e ?? 'efeito ok' });
    }
  }
} finally {
  await browser.close();
}
process.exit(reporta(linhas));
