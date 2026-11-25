# Protocolo de colaboração entre agentes

## Isolamento

- Tech lead: `C:\Users\victor\CRM`.
- Dev sênior: worktree `C:\Users\victor\CRM-senior` ou clone separado.
- Nunca dois agentes editam a mesma pasta de trabalho.
- O dev sênior parte de `origin/main`; o tech lead publica `main` reconciliada antes das fases.

## Branches

- `main` é a branch estável; todo trabalho entra por PR.
- Tech lead: `chore/...`, `feat/b1-...`, `feat/b2-engine...`, `feat/b5-...`.
- Dev sênior: `feat/sd-XX-...`.
- Nunca force push, nunca commit direto em `main`, nunca merge sem review do tech lead.

## Commits

Formato: `tipo(escopo): descrição curta (ID)`.

Exemplos:

- `feat(api): fila de leads nao atribuidos (TL-04)`
- `test(api): cobre horario comercial (SD-01)`
- `docs: publica contrato v0 (TL-03)`

## PR

- Um PR por tarefa ou por bloco coeso.
- Título com ID da tarefa.
- Descrição: objetivo, mudanças, como testar, riscos, arquivos tocados e wiring pendente.
- O dev sênior não faz merge; o tech lead revisa e faz merge.
- CI precisa estar verde.

## Ownership

| Área                                                                         | Dono       |
| ---------------------------------------------------------------------------- | ---------- |
| `packages/shared/src/index.ts`, schema, migrations                           | Tech lead  |
| `app.ts`, `server.ts`, `env.ts`, seed, dev-preview                           | Tech lead  |
| `package.json`, lockfile, `.env*`, CI, docs centrais                         | Tech lead  |
| Appointments, templates, cadence CRUD/enrollment, notifications, AI, reports | Dev sênior |
| Worker/engine de cadência, webhook, Meta live                                | Tech lead  |
| Páginas novas do frontend                                                    | Dev sênior |
| Shell, clients HTTP e integração final do frontend                           | Tech lead  |

Se um módulo do dev sênior precisar de wiring em `app.ts`/`server.ts`, ele descreve no PR.
O tech lead aplica o wiring na revisão.

## Bloqueios

- Contrato ambíguo ou ausente: parar e comentar no PR/issue.
- Necessidade de schema, migration, shared, dependência nova ou arquivo central: pedir ao
  tech lead; não editar por conta própria.
- Falha de CI: corrigir no mesmo branch.
- Segredo/dado real: nunca commitar; avisar imediatamente.

## Logs e handoff

- Cada agente mantém seu log em `docs/agent-log/<papel>.md`.
- O tech lead atualiza `docs/tasks.md` e `docs/handoff.md` após cada merge.
- O board do GitHub usa Issues com o mesmo ID das tarefas.
