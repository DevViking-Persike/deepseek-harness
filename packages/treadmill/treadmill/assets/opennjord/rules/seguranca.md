# Regras de Segurança

> Baseline de segurança do projeto — fonte única de invariantes do gate 40
> (`/seguranca`). Instanciada em 2026-07-10 a partir de
> `.opennjord/skills/scaffold-spec/templates/rules/seguranca.md`.
> Invariantes marcados **[INEGOCIÁVEL]** não mudam sem aprovação escrita.

## Segredos

- **[INEGOCIÁVEL]** Nunca abrir, colar, resumir ou logar valores de segredo
  (`~/.config/njord/secrets.yaml` em dev, macOS Keychain `njord-tauri-db` em
  release, `.env` reais, chaves, tokens). Só `*.example` e `*.enc` (cifrados)
  entram no git.
- Cifrar segredos em repouso (ex.: SOPS/age) e versionar **só** o cifrado; a chave
  privada nunca vai pro git.
- Rotação simples e documentada; comprometeu uma chave → rotaciona chave **e**
  segredos.
- No cluster, segredo vira Secret/sealed-secrets — nunca Secret YAML plano no git.

## Autenticação & Autorização

- **[INEGOCIÁVEL]** Bypass de auth **não** pode ser caminho de produção.
- Token/credencial nunca chega ao browser/cliente (fica server-side: cookie
  httpOnly cifrado ou equivalente; **nunca** em PageData/localStorage/bundle).
- AuthZ por papel/permissão checada **no servidor** (deny-by-default); rota não
  mapeada não fica liberada por omissão.
- Validar o token na borda confiável (JWKS/introspecção), não confiar em claims
  não verificados.

## Dados & Integridade

- **[INEGOCIÁVEL]** Audit log **append-only** — não deletar/alterar
  retroativamente (proteger no banco, ex.: trigger).
- Actor de auditoria vem do **usuário autenticado**, nunca do body da requisição.
- Validar/normalizar toda entrada externa (rejeitar inválido com 4xx); nunca
  montar SQL/comando por concatenação de input.
- Criptografia em repouso para dados sensíveis quando aplicável; TLS em trânsito.
- LGPD/privacidade e **mínimo privilégio** para usuários, operadores e automações.

## Aplicação (web)

- CSP restritiva (nonce, sem `unsafe-inline`); sanitizar saída para evitar XSS.
- Sem open-redirect: validar `returnTo`/deep-links contra allowlist.
- Sem SSRF: o backend não busca URL arbitrária vinda do cliente.
- Sem mass-assignment: aceitar só os campos esperados.

## Supply chain & Operação

- Dependências fixadas (sem `latest`); revisar antes de subir versão.
- Imagens de container mínimas (distroless/non-root) e de registry confiável.
- **[INEGOCIÁVEL]** Nunca afrouxar validação de segurança em produção (ex.: flags
  `*_LENIENT`, `*_BYPASS`) — só em `NODE_ENV=development`/dev local.
- Backup antes de operação destrutiva (`DROP`, migration irreversível, delete em
  massa).

## Verificação

- **Estático:** revisão de diff focada em segurança (`/security-review` ou
  equivalente) antes do merge.
- **Dinâmico:** a disciplina **40-segurança** da esteira (`.spec/sprints/`) tenta
  **invadir** o ambiente vivo (token vazando, authz, audit, CSP, redirect) —
  alvo em `redteam_target` no `.spec/MANIFEST.md`; contrato em
  `.spec/sprints/RUNBOOK.md`.

## Proibido

- Segredo em claro no git / em chat / em issue / em PR.
- Token/JWT/dado sensível em PageData, localStorage ou cookie não-httpOnly.
- Audit log com UPDATE/DELETE.
- Bypass de auth ou validação afrouxada em produção.
