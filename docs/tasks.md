# Board de tarefas

Status: `todo`, `doing`, `review`, `done`, `blocked`. O tech lead atualiza este arquivo após
cada merge. As Issues do GitHub espelham os mesmos IDs.

| ID    | Dono       | Entrega                                                                | Branch                     | Depende      | Issue | Status |
| ----- | ---------- | ---------------------------------------------------------------------- | -------------------------- | ------------ | ----- | ------ |
| TL-01 | Tech lead  | Reconciliar Git, baseline, encoding, CI e `verify`                     | `chore/b0-foundation`      | —            | #2    | done   |
| TL-02 | Tech lead  | Simulador inbound, harness headless e seed demo                        | `chore/b0-foundation`      | TL-01        | #3    | done   |
| TL-03 | Tech lead  | Contrato v0: schema/migrations B1-B3, shared e `backend-contract.md`   | `chore/b0-foundation`      | TL-01        | #4    | done   |
| SD-01 | Dev sênior | Utilitários puros: extrator IA, horário comercial e render de template | `feat/sd-01-utils`         | —            | #5    | done   |
| TL-04 | Tech lead  | B1: fila de não atribuídos, claim/release e consentimento              | `feat/b1-leads`            | TL-03        | #6    | done   |
| SD-02 | Dev sênior | B1: appointments service/routes e testes                               | `feat/sd-02-appointments`  | TL-03        | #7    | done   |
| TL-05 | Tech lead  | B1: wiring, seed e e2e headless                                        | `feat/b1-integration`      | TL-04, SD-02 | #8    | review |
| SD-03 | Dev sênior | B2: cadence CRUD, enrollment e eligibility                             | `feat/sd-03-cadence-api`   | TL-03        | #9    | review |
| SD-04 | Dev sênior | B2: templates CRUD                                                     | `feat/sd-04-templates`     | TL-03        | #10   | review |
| SD-05 | Dev sênior | B2: notifications e triggers                                           | `feat/sd-05-notifications` | TL-03        | #11   | todo   |
| TL-06 | Tech lead  | B2: worker/engine, envio, retry e idempotência                         | `feat/b2-engine`           | SD-01, SD-03 | #12   | review |
| TL-07 | Tech lead  | B2: hooks do webhook, opt-out, pausa e cancelamento por agendamento    | `feat/b2-hooks`            | TL-06, SD-05 | #13   | review |
| TL-08 | Tech lead  | B2: wiring, seed e e2e                                                 | `feat/b2-integration`      | TL-07        | #14   | review |
| SD-06 | Dev sênior | B3: AI service/routes/job com fallback                                 | `feat/sd-06-ai`            | TL-03, SD-01 | #15   | review |
| TL-09 | Tech lead  | B3: hook do webhook e flags de IA                                      | `feat/b3-hook`             | SD-06        | #16   | review |
| SD-07 | Dev sênior | B4: reports service/routes                                             | `feat/sd-07-reports`       | TL-08        | #17   | review |
| TL-10 | Tech lead  | B4: health/backlog/robustez, contrato v1 e handoff                     | `chore/b4-freeze`          | TL-09, SD-07 | #18   | review |
| TL-11 | Tech lead  | B5: Meta live e staging                                                | `feat/b5-meta`             | TL-10        | #19   | todo   |
| SD-08 | Dev sênior | F: agenda, cadências, relatórios e adições de leads                    | `feat/sd-08-pages`         | TL-10        | #20   | review |
| TL-12 | Tech lead  | F: shell, clients, e2e final e release                                 | `feat/f-integration`       | TL-11, SD-08 | #21   | review |

## Observações

- Estimativas: B0 2-3d; B1 4-5d; B2 6-8d; B3 4-5d; B4 2-3d; B5 3-5d; F 7-10d.
- B5 pode rodar em paralelo com F.
- Toda tarefa exige testes e `npm.cmd run verify` verde.
- SD-01 concluído; converter `confidence` 0-1 para 0-100 ao persistir em B3.
- Branch protection da `main` bloqueada pelo plano do repositório privado; PR + CI `verify` seguem obrigatórios por convenção.
