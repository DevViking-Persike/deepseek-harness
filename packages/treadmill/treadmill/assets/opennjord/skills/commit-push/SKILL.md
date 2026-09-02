---
name: commit-push
description: Fecha a rodada da Treadmill com commit e push em vez de deploy — agrupa o diff em commits convencionais por escopo, roda os checks locais relevantes e faz push da branch atual com --force-with-lease só quando a branch já foi reescrita. Use quando o usuário pedir "commit e push", "fechar a sprint no git", "subir o código", ou quando a etapa commit-push da Treadmill estiver ativa no lugar de deploy.
---

# commit-push — fechamento da rodada no Git

Etapa transversal da Treadmill que substitui `deploy` quando o projeto entrega por repositório, não por ambiente. Roda depois dos gates de QA e Segurança aprovados (ou pulados, se desligados na tabela de etapas).

## Pré-condições (DoR)

1. `git status` limpo de artefatos gerados: nada de `node_modules`, `dist`, logs ou saídas de ferramenta. Se houver, adicione ao `.gitignore` antes.
2. O cursor `.spec/esteira-state.yaml` aponta para `commit-push` e os vereditos de `30-qa` e `40-seguranca` são `APROVADO`, ou essas etapas estão desligadas na tabela.
3. A branch atual não é `main`/`master`. Se for, crie `feat/<sprint>-<tema>` antes.

## Passos

1. **Agrupar o diff por escopo.** Um commit por pacote ou por preocupação (`feat(<área>)`, `fix(<área>)`, `docs`, `test`), nunca um commit único com tudo. Arquivos de `.spec/` e `docs/adrs/` entram no commit do incremento que os produziu.
2. **Mensagem.** Título imperativo em inglês com prefixo convencional; corpo com o porquê, não o quê. Sem referências a chats ou sessões.
3. **Checks locais.** Rode os testes e o typecheck do que mudou (o pre-commit e o pre-push do projeto decidem o mínimo). Um check vermelho bloqueia o push: corrija ou pare em `awaiting: humano:commit-push`.
4. **Push.** `git push -u origin <branch>`. Só use `--force-with-lease` se a branch já existia no remoto e foi reescrita nesta rodada; nunca `--force`.
5. **Receipt.** Registre no `STATE.md` o hash final, a branch e o remoto, e avance o cursor: `etapa: done` para a rodada, ou `00s` se ainda houver sprint pendente no backlog.

## Parada humana

Abrir pull request, mesclar e criar tags são decisões do dono do repositório: a skill para em `awaiting: humano:commit-push` com o link da branch, sem abrir PR sozinha, a menos que o MANIFEST autorize explicitamente.
