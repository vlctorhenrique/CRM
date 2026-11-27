# Board de tarefas

Status: `todo`, `doing`, `review`, `done`, `blocked`. O tech lead atualiza este arquivo após
cada merge. As Issues do GitHub espelham os mesmos IDs.

| ID    | Dono       | Entrega                                                                | Branch                     | Depende      | Issue | PR  | Status |
| ----- | ---------- | ---------------------------------------------------------------------- | -------------------------- | ------------ | ----- | --- | ------ |
| TL-01 | Tech lead  | Reconciliar Git, baseline, encoding, CI e `verify`                     | `chore/b0-foundation`      | —            | #2    | #23 | done   |
| TL-02 | Tech lead  | Simulador inbound, harness headless e seed demo                        | `chore/b0-foundation`      | TL-01        | #3    | #23 | done   |
| TL-03 | Tech lead  | Contrato v0: schema/migrations B1-B3, shared e `backend-contract.md`   | `chore/b0-foundation`      | TL-01        | #4    | #23 | done   |
| SD-01 | Dev sênior | Utilitários puros: extrator IA, horário comercial e render de template | `feat/sd-01-utils`         | —            | #5    | #22 | done   |
| TL-04 | Tech lead  | B1: fila de não atribuídos, claim/release e consentimento              | `feat/b1-leads`            | TL-03        | #6    | #26 | done   |
| SD-02 | Dev sênior | B1: appointments service/routes e testes                               | `feat/sd-02-appointments`  | TL-03        | #7    | #29 | done   |
| TL-05 | Tech lead  | B1: wiring, seed e e2e headless                                        | `feat/b1-integration`      | TL-04, SD-02 | #8    | #30 | done   |
| SD-03 | Dev sênior | B2: cadence CRUD, enrollment e eligibility                             | `feat/sd-03-cadence-api`   | TL-03        | #9    | #32 | done   |
| SD-04 | Dev sênior | B2: templates CRUD                                                     | `feat/sd-04-templates`     | TL-03        | #10   | #31 | done   |
| SD-05 | Dev sênior | B2: notifications e triggers                                           | `feat/sd-05-notifications` | TL-03        | #11   | #33 | done   |
| TL-06 | Tech lead  | B2: worker/engine, envio, retry e idempotência                         | `feat/b2-engine`           | SD-01, SD-03 | #12   | #34 | done   |
| TL-07 | Tech lead  | B2: hooks do webhook, opt-out, pausa e cancelamento por agendamento    | `feat/b2-hooks`            | TL-06, SD-05 | #13   | #35 | done   |
| TL-08 | Tech lead  | B2: wiring, seed e e2e                                                 | `feat/b2-integration`      | TL-07        | #14   | #36 | done   |
| SD-06 | Dev sênior | B3: AI service/routes/job com fallback                                 | `feat/sd-06-ai`            | TL-03, SD-01 | #15   | #37 | done   |
| TL-09 | Tech lead  | B3: hook do webhook e flags de IA                                      | `feat/b3-hook`             | SD-06        | #16   | #38 | done   |
| SD-07 | Dev sênior | B4: reports service/routes                                             | `feat/sd-07-reports`       | TL-08        | #17   | #39 | done   |
| TL-10 | Tech lead  | B4: health/backlog/robustez, contrato v1 e handoff                     | `chore/b4-freeze`          | TL-09, SD-07 | #18   | #40 | done   |
| TL-11 | Tech lead  | B5: Meta live e staging                                                | `feat/b5-meta`             | TL-10        | #19   | #53 | done   |
| SD-08 | Dev sênior | F: agenda, cadências, relatórios e adições de leads                    | `feat/sd-08-pages`         | TL-10        | #20   | #41 | done   |
| TL-12 | Tech lead  | F: shell, clients, e2e final e release                                 | `feat/f-integration`       | TL-11, SD-08 | #21   | #42 | done   |
| E3-01 | Tech lead  | Etapa 3: classificação de mensagens e limites de resposta              | `feat/e3-classification`   | TL-12        | #54   | #55 | done   |
| E3-02 | Tech lead  | Etapa 3: modo silencioso, persistência e encaminhamento à SDR          | `feat/e3-silent`           | E3-01        | #54   | #56 | done   |
| E3-03 | Tech lead  | Etapa 3: painel, contrato, README e handoff                            | `feat/e3-panel`            | E3-02        | #54   | #57 | done   |
| E4-01 | Tech lead  | Etapa 4: helpers de atribuição e mudança de status                     | `feat/e4-kanban`           | E3-03        | #58   | #59 | done   |
| E4-02 | Tech lead  | Etapa 4: Kanban, fila da SDR e documentação                            | `feat/e4-kanban-ui`        | E4-01        | #58   | #60 | done   |
| E5-01 | Tech lead  | Etapa 5: elegibilidade, seleção em lote e prévia                       | `feat/e5-eligibility`      | E4-02        | #61   | #62 | done   |
| E5-02 | Tech lead  | Etapa 5: painel de seleção, contrato e docs                            | `feat/e5-selection-ui`     | E5-01        | #61   | #63 | done   |
| E6-01 | Tech lead  | Etapa 6: backup monitorado no health e script de status                | `feat/e6-backup-monitor`   | E5-02        | #64   | #65 | done   |
| E6-02 | Tech lead  | Etapa 6: testes de aceitação, contrato e docs                          | `feat/e6-acceptance`       | E6-01        | #64   | #66 | done   |

## Observações

- Sincronizado em 27/11/2026: **30 de 30 tarefas `done`**. B5 validado com webhook assinado,
  inbound processado, envio real e idempotência (issue #19/PR #53); Etapa 3 entregue com extração,
  classificação, resumo e modo silencioso (issue #54/PRs #55–#57); Etapa 4 entregue com Kanban,
  fila de atribuição da SDR e agendamento manual existente (issue #58/PRs #59–#60); Etapa 5 com
  fila de elegíveis, prévia e inscrição em lote (issue #61/PRs #62–#63); Etapa 6 com backup
  monitorado e testes de aceitação (issue #64/PRs #65–#66).
- Pós-release: #44 worker de IA, #45 notificações, #46 filtro de relatórios, #47/#49 docs,
  #50 proteção de credenciais, #51 correção da prévia, #52 redaction de logs, #53 fechamento do B5.
- Estimativas: B0 2-3d; B1 4-5d; B2 6-8d; B3 4-5d; B4 2-3d; B5 3-5d; F 7-10d.
- B5 pode rodar em paralelo com F.
- Toda tarefa exige testes e `npm.cmd run verify` verde.
- SD-01 concluído; `confidence` convertido de 0-1 para 0-100 ao persistir em B3.
- Branch protection da `main` bloqueada pelo plano do repositório privado; PR + CI `verify` seguem obrigatórios por convenção.
