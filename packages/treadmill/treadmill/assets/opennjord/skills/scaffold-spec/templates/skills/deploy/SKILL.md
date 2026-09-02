---
name: deploy
description: >-
  Sobe ou atualiza o projeto no ambiente alvo: build das imagens, push para o
  registry, apply dos manifests, rollout e smoke tests. Use quando o usuário
  pedir "deploy", "subir staging/prod", "atualizar no cluster", "rollout",
  "publicar", ou variações. Preencha os placeholders com a infra real do projeto.
---

# Skill: deploy

Runbook de deploy do projeto. **Fonte de verdade:** `.claude/rules/staging-deploy.md`
quando rodar no Claude Code, ou a regra equivalente do projeto quando rodar no
Codex. Crie-a com a topologia real. Esta skill é o roteiro operacional; preencha
os `<...>` no primeiro uso.

## Pré-requisitos

- Acesso ao cluster/host (`<kubectl/KUBECONFIG ou ssh>`).
- Login no registry (`<registry>`), credenciais seguindo `.claude/rules/seguranca.md`
  no Claude Code ou a regra equivalente no Codex (nunca em claro).
- Build tooling (`<docker buildx / plataforma alvo, ex. linux/arm64>`).

## Passos

### 1. Build + push das imagens
```bash
# login no registry
echo "$REG_PASSWORD" | docker login <registry> -u "$REG_USER" --password-stdin

# backend / serviços (1 por serviço, se distribuído)
docker buildx build --platform <plataforma> -f <Dockerfile> \
  -t <registry>/<app>:<tag> --push <contexto>

# frontend (e MFEs, se houver)
docker buildx build --platform <plataforma> -f <Dockerfile> \
  -t <registry>/<frontend>:<tag> --push <contexto>
```
> Tag mutável (`:staging`) é prática; para snapshot use `:sha-<commit>`.

### 2. Segredos no cluster
Aplicar os Secrets a partir dos `.enc` cifrados (ver `.claude/rules/seguranca.md`
no Claude Code, ou regra equivalente no Codex):
```bash
<infra/secrets/apply-secrets.sh all   # ou o mecanismo do projeto (sealed-secrets/kubeseal)>
```

### 3. Aplicar manifests + rollout
```bash
<kubectl apply -k <overlay>            # ou helm upgrade --install, conforme o projeto>
<kubectl -n <ns> rollout status deploy/<app> --timeout=120s>
```

### 4. Migrations / seed
- `<mecanismo: migrate-on-startup | Job | initContainer>` — registrar aqui o que o
  projeto usa. Não depender de migration nova sem mecanismo definido.

### 5. Smoke test (validação)
```bash
# interno
<kubectl -n <ns> exec deploy/<frontend> -- wget -qO- http://<backend>:<port>/health>
# externo
curl -sI https://<host>/         | head -3     # 200/30x
curl -sI https://<host>/api/health | head -3   # 200
```
Depois: login real (se houver auth) e o RPA de QA do incremento
(`.spec/qa/sprint-NN-<tema>/`) com o host do ambiente.

## Restrições (de `.claude/rules/seguranca.md` ou equivalente Codex)

- Nunca afrouxar validação/auth em produção (`*_LENIENT`/`*_BYPASS`).
- Nunca commitar Secret plano; backup antes de operação destrutiva no banco.
- Produção é **parada obrigatória** — confirmar com o humano antes.

## Anti-patterns

- ❌ Deploy sem smoke test (não saber se subiu de verdade).
- ❌ Combinar deploy com mudança de schema sem mecanismo de migration definido.
- ❌ Tag `:latest` para algo que precisa ser reproduzível — pin por commit.
