# Exemplos de discovery "bom" (referência)

Exemplos preenchidos para calibrar qualidade. Tema fictício: **lembrete de
vencimento de fatura** num SaaS de cobrança.

---

## Exemplo A — modo NEGÓCIO

**Outcome:** reduzir inadimplência (churn involuntário). Métrica: % de faturas
pagas até o vencimento — hoje **71%**, alvo 85%.

**Usuário/contexto:** dono de pequena empresa, paga várias faturas no fim do mês,
**esquece** vencimentos quando estão fora do e-mail principal.

**Oportunidade (Mom Test):** "Me conta a última vez que pagou uma fatura em
atraso." → *"Vi a notificação de bloqueio do serviço, aí paguei correndo."* →
descobre alternativas hoje, frustração e custo real, não opinião.

**JTBD:** quando uma fatura está pra vencer, quero **ser lembrado no canal que eu
checo** (WhatsApp), pra **não pagar multa nem ter serviço cortado**.

**4 riscos:** Valor — 3 de 5 entrevistados já pagaram multa evitável (sinal real).
Usabilidade — opt-in simples. Viab. técnica — gateway de WhatsApp já integrado
(→ dev). Viab. negócio — custo por mensagem < multa evitada; LGPD: precisa consentimento.

**Sucesso:** "menos faturas vencem sem aviso." Leading: % de faturas com lembrete
entregue. Lagging: pagas-até-vencimento de 71% → 85%.
**MVP:** 1 lembrete, 3 dias antes, WhatsApp, opt-in. **Fora:** régua multi-toque, e-mail, SMS.

**Regras & Fluxo de negócio:** só cliente com **opt-in** ativo recebe (invariante
de negócio + compliance LGPD); envio só na janela comercial 8h–20h; fluxo =
fatura entra em D-3 → checa consentimento → dispara → registra. Caso-limite:
fatura já paga antes do D-3 não gera lembrete.

---

## Exemplo B — modo DESENVOLVIMENTO

**Escopo:** envia 1 lembrete por fatura, 3 dias antes do vencimento, via WhatsApp,
só para clientes opt-in. **NÃO:** régua de cobrança, retry inteligente, outros canais.
**Slice:** job diário que seleciona faturas D-3 e dispara via gateway.

**Requisitos:** entrada = faturas com `vencimento = hoje+3` e `cliente.optin=true`;
saída = mensagem enviada + registro de envio (idempotente: 1 por fatura).

**NFR (com número):** Performance — processar 50k faturas/dia em < 10 min.
Confiabilidade — idempotente (reprocesso não duplica); falha do gateway → retry com
backoff, no máx 3. Segurança — consentimento LGPD registrado; telefone é dado pessoal
(não logar em claro). Observabilidade — métrica de enviados/falhos.

**Restrições:** gateway WhatsApp existente (rate limit 80 msg/s; custo por msg);
janela de envio comercial (8h–20h). Legal: opt-in obrigatório.

**Premissas/riscos:** premissa = telefone cadastrado está correto (risco: bounce —
medir taxa). Risco compliance: enviar sem opt-in = multa LGPD (desenhar o gate antes).
Spike: validar rate limit real do gateway com 1k mensagens.

**Aceitação (verificável):**
1. **Dado** fatura D-3 de cliente opt-in **quando** o job roda **então** 1 lembrete é
   enviado e registrado (e reprocessar não envia de novo).
2. **Dado** cliente **sem** opt-in **quando** o job roda **então** nenhum envio ocorre.
3. **Dado** gateway fora **quando** o envio falha **então** há retry (≤3) e a falha é métrica.

**Definition of Ready:** ✅ escopo, ✅ NFR com número, ✅ restrições/compliance, ✅
aceitação verificável → pronto pra Arquitetura.

---

## Exemplo C — modo REFATORAÇÃO

Mesmo SaaS de cobrança; o job de lembretes já existe mas **está lento e duplica
envios** sob reprocesso.

**Alvo & motivação:** o job de D-3 leva **22 min** para 50k faturas (alvo era
< 10 min) e, quando reprocessado após falha parcial, **reenvia** para quem já
recebeu. Débito: seleção O(n²) e envio sem chave de idempotência. Por agora: um
cliente reclamou de lembrete duplicado (risco de reputação + custo por msg).

**Estado atual / inventário:** `jobs/lembrete_d3.rb` (seleção + envio no mesmo
laço), `gateway/whatsapp_client.rb` (sem dedupe). Testes: só happy-path do envio,
**sem** teste de reprocesso.

**Não-regressão:** preservar — 1 lembrete por fatura opt-in em D-3, dentro da
janela 8h–20h. Caracterização atual insuficiente → escrever teste de reprocesso
**antes** de mexer (lacuna marcada).

**Bug (duplicação):** repro = rodar o job, matar no meio, rodar de novo → faturas
já enviadas recebem 2ª msg. Causa-raiz hipotética: ausência de registro de envio
consultado antes do disparo. Correto: reprocesso **não** reenvia (idempotente).

**Performance:** baseline 22 min / 50k. Alvo < 10 min. Hotspot: query de seleção
por varredura completa. Medir com `EXPLAIN ANALYZE` + timing por lote.

**Design/código:** separar **seleção** (query indexada por `vencimento`+`optin`)
do **envio** (com chave de idempotência `fatura_id`); quebrar o laço único.

**Raio de impacto:** NÃO tocar no contrato do gateway nem no schema de faturas
(só adicionar tabela `envios`). Fatiar: (1) teste de caracterização de reprocesso;
(2) tabela + chave de idempotência; (3) índice + seleção em lote.

**Aceitação (verificável):**
1. **Dado** o job interrompido no meio **quando** reprocessado **então** nenhuma
   fatura já enviada recebe 2ª mensagem (não-regressão + bugfix).
2. **Dado** 50k faturas **quando** o job roda **então** conclui em < 10 min (perf).
