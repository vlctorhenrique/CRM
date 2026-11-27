# Contrato backend v1

Versão: 1.0 — 2026-11. Owner: tech lead. Mudanças neste arquivo e em `packages/shared` são
centralizadas no tech lead.

## Regras gerais

- Base: `/v1`. Auth por cookie `crm_access` (ou `Authorization: Bearer`).
- Toda consulta de negócio filtra `tenant_id` do token.
- Erros seguem `ApiErrorBody`: `{ error: { code, message, details?, requestId? } }`.
- Listagens usam `limit` (1-100/200) e `offset`.
- Datas em ISO 8601 com timezone; regras de horário usam o timezone da clínica.
- SDR: vê próprios leads e a fila de não atribuídos; admin/gerente veem a clínica.
- IDs de outro tenant retornam 404.
- Operações sensíveis registram `audit_logs`.

## Enums compartilhados

- `AppointmentStatus`: `scheduled`, `confirmed`, `completed`, `cancelled`, `no_show`.
- `TemplateStatus`: `draft`, `pending`, `approved`, `rejected`, `paused`.
- `TemplateCategory`: `marketing`, `utility`.
- `CadenceStatus`: `draft`, `active`, `paused`, `archived`.
- `CadenceEnrollmentStatus`: `active`, `paused`, `completed`, `cancelled`, `failed`.
- `CadenceTaskStatus`: `pending`, `processing`, `sent`, `skipped`, `failed`, `cancelled`.
- `NotificationType`: `lead_assigned`, `appointment_created`, `appointment_cancelled`,
  `cadence_completed`, `cadence_failed`, `ai_insight`, `system`.
- `AiInsightType`: `extraction`, `summary`, `classification`.
- `AiInsightStatus`: `pending`, `processing`, `completed`, `failed`.
- `AiMode`: `off`, `fallback`, `llm`.
- Consentimento: `unknown`, `granted`, `revoked`.

## Modelo de dados

### appointments

`id`, `tenant_id`, `lead_id`, `owner_user_id`, `created_by_user_id`, `procedure`,
`scheduled_at`, `duration_minutes` (15-480, padrão 60), `status`, `notes`,
`cancellation_reason`, `cancelled_at`, `created_at`, `updated_at`.

Transições permitidas:

- `scheduled` → `confirmed`, `completed`, `cancelled`, `no_show`.
- `confirmed` → `completed`, `cancelled`, `no_show`.
- `completed`, `cancelled`, `no_show` são finais.

Ao criar/confirmar agendamento: cancelar tarefas futuras da cadência do lead e notificar o
responsável. Ao cancelar: registrar motivo, `cancelled_at` e auditoria.

### message_templates

`id`, `tenant_id`, `name`, `category`, `language`, `body`, `variables` (jsonb string[]),
`status`, `meta_template_id`, `rejection_reason`, `created_by_user_id`, timestamps.

- `variables` é derivado do body (`{{nome}}`, `{{procedimento}}`, etc.).
- `draft` pode ser editado; `approved` não pode ter body alterado sem voltar para `pending`.
- Templates são locais; aprovação na Meta é sincronização manual em B5.

### cadences e cadence_steps

`cadences`: `id`, `tenant_id`, `name`, `description`, `status`, `created_by_user_id`,
timestamps.

`cadence_steps`: `id`, `tenant_id`, `cadence_id`, `template_id`, `position`, `delay_hours`,
`created_at`.

- Passos ordenados por `position` (1..20); `delay_hours` 0..336.
- Só é possível editar passos em `draft`.
- `active` exige ao menos um passo e todos os templates `approved`.
- `archived` é final.

### cadence_enrollments

`id`, `tenant_id`, `lead_id`, `cadence_id`, `status`, `current_step`, `next_send_at`,
`started_at`, `paused_at`, `pause_reason`, `completed_at`, `cancelled_at`, `cancel_reason`,
`created_by_user_id`, timestamps.

Regras:

- Um lead não pode ter duas inscrições `active` ao mesmo tempo.
- Elegibilidade: consentimento `granted`, sem opt-out, sem agendamento futuro, lead não
  perdido/opt-out, cadência `active`.
- Ao entrar, criar tarefas futuras para todos os passos; a primeira vence em
  `started_at + delay_hours`, ajustada para o horário comercial.
- Ao pausar, cancelar/segurar tarefas pendentes; ao retomar, recalcular.
- Ao completar, marcar `completed` e notificar.
- Ao cancelar, registrar motivo; tarefas pendentes viram `cancelled`.

### cadence_tasks

`id`, `tenant_id`, `enrollment_id`, `lead_id`, `cadence_id`, `step_id`, `scheduled_at`,
`status`, `attempts`, `max_attempts`, `locked_at`, `next_attempt_at`, `sent_at`,
`provider_message_id`, `error`, timestamps.

- `unique(enrollment_id, step_id)` garante idempotência.
- Worker pega `pending` com `scheduled_at <= now` e `next_attempt_at <= now`.
- Lock por `locked_at` com timeout de 60s.
- Sucesso: `sent`, cria `messages` outbound, atualiza enrollment para o próximo passo.
- Falha: incrementa `attempts`; se `attempts < max_attempts`, volta para `pending` com
  backoff (5min, 15min, 60min); senão `failed` e notifica.
- Resposta humana, opt-out ou agendamento cancelam tarefas futuras.

### notifications

`id`, `tenant_id`, `user_id`, `type`, `title`, `body`, `entity_type`, `entity_id`, `read_at`,
`created_at`.

### ai_insights

`id`, `tenant_id`, `lead_id`, `conversation_id`, `message_id`, `type`, `status`, `result`,
`confidence`, `model`, `error`, `attempts`, `next_attempt_at`, timestamps.

- `unique(message_id, type)` para idempotência.
- `fallback` usa extrator determinístico; `llm` só com `AI_API_KEY`.
- Resultado é silencioso: nunca envia mensagem automaticamente.
- `confidence` é 0-1 no utilitário determinístico; ao persistir em `ai_insights.confidence`
  (inteiro), multiplicar por 100 e arredondar. `result` guarda apenas dados estruturados, sem
  conteúdo clínico bruto.

## Endpoints

### Leads

| Método | Rota                         | Permissão   | Descrição                                                                           |
| ------ | ---------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| GET    | `/v1/leads`                  | autenticado | Lista com `search`, `status`, `assignment=all\|mine\|unassigned`, `limit`, `offset` |
| POST   | `/v1/leads`                  | autenticado | Cria lead manual                                                                    |
| GET    | `/v1/leads/:leadId`          | autenticado | Detalhe + conversa + mensagens + próxima agenda                                     |
| PATCH  | `/v1/leads/:leadId`          | autenticado | Atualiza qualificação/status; SDR só próprio                                        |
| POST   | `/v1/leads/:leadId/claim`    | autenticado | Assume lead não atribuído; idempotente                                              |
| POST   | `/v1/leads/:leadId/release`  | autenticado | Remove responsável; admin/gerente ou dono                                           |
| POST   | `/v1/leads/:leadId/consent`  | autenticado | Registra consentimento explícito                                                    |
| POST   | `/v1/leads/:leadId/messages` | autenticado | Envia texto manual dentro da janela 24h                                             |
| POST   | `/v1/leads/:leadId/read`     | autenticado | Zera não lidas da conversa                                                          |

`consent` body: `{ "status": "granted"|"revoked", "evidence": "...", "textVersion": "..." }`.
`granted` exige evidência e versão; atualiza `consent_at`, `consent_evidence`,
`consent_text_version` e auditoria. `revoked` bloqueia envios e cancela cadências.

### Appointments

| Método | Rota                              | Permissão   | Descrição                               |
| ------ | --------------------------------- | ----------- | --------------------------------------- |
| GET    | `/v1/appointments`                | autenticado | Filtra `from`, `to`, `status`, `leadId` |
| POST   | `/v1/appointments`                | autenticado | Cria agendamento manual                 |
| GET    | `/v1/appointments/:appointmentId` | autenticado | Detalhe                                 |
| PATCH  | `/v1/appointments/:appointmentId` | autenticado | Atualiza status/dados                   |

Body de criação: `leadId`, `scheduledAt`, `durationMinutes`, `procedure?`, `notes?`,
`ownerUserId?`. Ao criar, `ownerUserId` padrão é o responsável do lead; notifica o dono.
Cancelamento usa `PATCH` com `status: "cancelled"` e `cancellationReason`.

### Templates

| Método | Rota                        | Permissão     | Descrição                     |
| ------ | --------------------------- | ------------- | ----------------------------- |
| GET    | `/v1/templates`             | autenticado   | Lista com `status` e `search` |
| POST   | `/v1/templates`             | admin/gerente | Cria rascunho                 |
| GET    | `/v1/templates/:templateId` | autenticado   | Detalhe                       |
| PATCH  | `/v1/templates/:templateId` | admin/gerente | Atualiza corpo/dados/status   |

### Cadences

| Método | Rota                                    | Permissão     | Descrição                              |
| ------ | --------------------------------------- | ------------- | -------------------------------------- |
| GET    | `/v1/cadences`                          | autenticado   | Lista com `status`                     |
| POST   | `/v1/cadences`                          | admin/gerente | Cria com passos                        |
| GET    | `/v1/cadences/:cadenceId`               | autenticado   | Detalhe com passos                     |
| PATCH  | `/v1/cadences/:cadenceId`               | admin/gerente | Atualiza dados/status/passos em draft  |
| POST   | `/v1/cadences/:cadenceId/enroll`        | admin/gerente | Inscreve lead elegível                 |
| GET    | `/v1/cadence-enrollments`               | autenticado   | Filtra `leadId`, `cadenceId`, `status` |
| PATCH  | `/v1/cadence-enrollments/:enrollmentId` | admin/gerente | Pausa/retoma/cancela                   |

### Notifications

| Método | Rota                             | Permissão   | Descrição                      |
| ------ | -------------------------------- | ----------- | ------------------------------ |
| GET    | `/v1/notifications`              | autenticado | Lista do usuário; `unreadOnly` |
| GET    | `/v1/notifications/unread-count` | autenticado | Contador                       |
| POST   | `/v1/notifications/read`         | autenticado | Marca `ids` como lidas         |

### IA

| Método | Rota                                   | Permissão     | Descrição                     |
| ------ | -------------------------------------- | ------------- | ----------------------------- |
| GET    | `/v1/leads/:leadId/ai-insights`        | autenticado   | Insights do lead              |
| POST   | `/v1/leads/:leadId/ai-insights`        | autenticado   | Enfileira extração/resumo     |
| PATCH  | `/v1/conversations/:conversationId/ai` | admin/gerente | Define IA ativa ou silenciosa |

O worker de IA roda no processo da API a cada 60s, respeita `AI_MODE`, `AI_DAILY_LIMIT` e
`AI_TIMEOUT_MS`, e nunca envia mensagem. `AI_MODE=off` também desliga o worker. Cada insight
traz `summary`, `classification` (`qualification`, `scheduling`, `clinical_question`,
`pricing_question`, `out_of_scope`, `other`), `requiresSdr` e `silent`. Campos do lead ainda não
preenchidos (`interestProcedure`, `objective`, `bodyRegion`, `previousTreatment`) são preenchidos
apenas com dados informados pelo contato. Casos clínicos, preço e fora de escopo geram notificação
interna para a SDR. Em atendimento humano, `aiEnabled=false` mantém a análise (`silent=true`).

### Relatórios

| Método | Rota                       | Permissão   | Descrição                            |
| ------ | -------------------------- | ----------- | ------------------------------------ |
| GET    | `/v1/reports/summary`      | autenticado | Funil, agenda, cadências e mensagens |
| GET    | `/v1/reports/cadences`     | autenticado | Desempenho por cadência              |
| GET    | `/v1/reports/appointments` | autenticado | Agenda por período/status            |

Filtros: `from`, `to`, `ownerUserId`. SDR vê apenas os próprios dados.

### Desenvolvimento

| Método | Rota                       | Permissão   | Descrição                                                             |
| ------ | -------------------------- | ----------- | --------------------------------------------------------------------- |
| POST   | `/v1/dev/simulate-inbound` | autenticado | Simula inbound; só com `ENABLE_DEV_SIMULATOR=true` e fora de produção |

Body: `{ "phone": "...", "name?": "...", "text": "..." }`. Retorna `processed`, `ignored`,
`leadId`.

### Sistema

| Método | Rota      | Permissão | Descrição                                                           |
| ------ | --------- | --------- | ------------------------------------------------------------------- |
| GET    | `/health` | pública   | Status de database/redis e backlog de `cadence_tasks`/`ai_insights` |

`backlog` expõe `cadenceTasksPending`, `cadenceTasksStale` (locked sem atualização por 60s) e
`aiInsightsPending`.

## Worker de cadências

- Intervalo: `CADENCE_WORKER_INTERVAL_MS`; desligável com `CADENCE_WORKER_ENABLED=false`.
- Roda no processo da API; início em `server.ts` e parada no shutdown.
- Cada execução:
  1. Seleciona tarefas vencidas com lock.
  2. Verifica elegibilidade e opt-out.
  3. Renderiza template e envia via `sendWhatsAppText` (dry-run/live).
  4. Registra `messages`, atualiza `cadence_tasks` e `cadence_enrollments`.
  5. Cria notificação em falha definitiva/conclusão.
- Idempotência: unique `(enrollment_id, step_id)` + update condicional de status.
- Nunca envia fora do horário comercial da clínica.

## RBAC

| Capacidade         | Admin    | Gerente  | SDR                       |
| ------------------ | -------- | -------- | ------------------------- |
| Ver leads          | Todos    | Todos    | Próprios + fila           |
| Criar/editar leads | Sim      | Sim      | Próprios                  |
| Claim/release      | Sim      | Sim      | Claim; release do próprio |
| Consentimento      | Sim      | Sim      | Próprios                  |
| Agenda             | Todos    | Todos    | Próprios                  |
| Templates          | Sim      | Sim      | Ler                       |
| Cadências          | Sim      | Sim      | Ler                       |
| Notificações       | Próprias | Próprias | Próprias                  |
| IA                 | Sim      | Sim      | Próprios leads            |
| Relatórios         | Todos    | Todos    | Próprios                  |

## Env

- `ENABLE_DEV_SIMULATOR=false`
- `CADENCE_WORKER_ENABLED=true`
- `CADENCE_WORKER_INTERVAL_MS=30000`
- `CADENCE_MAX_ATTEMPTS=3`
- `AI_MODE=off|fallback|llm`
- `AI_MODEL`, `AI_API_KEY`, `AI_DAILY_LIMIT`, `AI_TIMEOUT_MS`

## Erros principais

- `LEAD_OPT_OUT` 409: contato bloqueado.
- `CONSENT_REQUIRED` 409: cadência exige consentimento.
- `APPOINTMENT_CONFLICT` 409: horário já ocupado para o mesmo profissional.
- `CADENCE_NOT_ACTIVE` 409: cadência não está ativa.
- `TEMPLATE_NOT_APPROVED` 409: template não aprovado.
- `WHATSAPP_WINDOW_CLOSED` 409: fora da janela 24h para texto livre.
- `WHATSAPP_NOT_CONFIGURED` 409/503: número não configurado.
- `INVALID_WINDOW` 400: janela de horário inválida.

## Critérios de aceite por fase

- B1: SDR vê fila e próprios; claim/release idempotentes; consentimento auditado;
  agendamento cria/cancela tarefas e notifica; testes de RBAC/tenant.
- B2: cadência ativa envia uma vez por passo, respeita horário/opt-out, retry e conclusão;
  templates validam variáveis; notificações criadas.
- B3: IA silenciosa e idempotente, fallback sem rede, LLM opcional; extração, resumo e
  classificação sem inventar dados; encaminha dúvidas clínicas/preço à SDR; nenhum envio automático.
- E3 (Etapa 3 do README/PRD): análise continua em atendimento humano (`silent=true`), preenche
  somente campos vazios do lead e notifica a SDR nos casos fora de escopo.
- B4: relatórios filtram tenant/período/responsável; health expõe backlog do worker; contrato v1
  publicado; handoff atualizado.
