# Contexto atual e handoff

Atualizado em 24/11/2026. Este documento resume o estado do projeto para continuar em outra
seção. Ele não contém tokens nem segredos.

## Status

- **Etapa 1 — Fundação:** concluída; commits originais `198fd4b`/`350be1c` preservados na
  branch `backup/local-main-350be1c`.
- **Etapa 2 — CRM e WhatsApp:** concluída e reconciliada no PR #1.
- **Etapa 2 — validação live:** concluída em 26/11/2026 (webhook, envio e idempotência validados).
- **B0 — Fundação da Etapa 3:** concluído e mergeado na `main` em `09b7703` (PR #23); issues
  #2–#4 fechadas.
- **SD-01 — Utilitários puros:** concluído e mergeado em `80a815d` (PR #22): extrator
  determinístico, horário comercial e render de templates. `confidence` vem em 0-1; converter
  para 0-100 ao persistir em B3.
- **B1 — Leads/agenda/consentimento:** concluído (PRs #26, #29 e #30): filtro `assignment`,
  claim/release, consentimento auditado, CRUD de agendamentos e e2e headless.
- **B2 — Cadências:** concluído (PRs #31–#36): templates, cadências, inscrições, worker, hooks de
  opt-out/resposta, notificações e seed/e2e.
- **B3 — IA assistiva:** concluído (PRs #37–#38): insights com fallback/LLM opcional e hook no
  webhook; `confidence` persistido como 0-100.
- **B4 — Relatórios e robustez:** concluído em `e4667e6` (PR #39) e `90adf8c` (PR #40).
- **B5 — Meta live:** concluído. Credenciais de teste carregadas, webhook verificado, inbound
  processado, resposta automática e envio manual enviados pela Cloud API, e duplicata ignorada.
  Issue #19 fechada no PR #53.
- **F — Frontend:** concluído. SD-08 em `0d50d86` (PR #41) entregou agenda, cadências,
  relatórios e insights; TL-12 em `c7f6645` (PR #42) finalizou shell, clients e release.
- **Pós-release:** PR #44 ligou o worker de IA no servidor; #45 entregou página de notificações;
  #46 adicionou filtro de período nos relatórios; #47/#49 docs; #48 sincronizou o board; #50
  protegeu credenciais; #51 corrigiu a prévia; #52 redactionou segredos em URLs; #53 fechou B5.
- **Etapa 3 (README/PRD):** concluída em #55–#57 (issue #54): classificação e limites de resposta,
  modo silencioso com persistência assistiva, encaminhamento à SDR e painel/contrato atualizados.
- **Etapa 4 (README/PRD):** concluída em #59–#60 (issue #58): Kanban com movimentação rápida de
  status, filtro `assignment` para a fila da SDR e agendamento manual sem integração UNO.
- **Etapa 5 (README/PRD):** concluída em #62–#63 (issue #61): fila de elegíveis com motivos,
  prévia antes da inscrição em lote, SDR limitada aos próprios leads e auditoria por inscrição.
- **Etapa 6 (README/PRD):** concluída em #65–#66 (issue #64): backup monitorado no `/health` e suíte
  de aceitação dos critérios do MVP.
- **Etapa 7 (README/PRD):** pronta em #68–#69 (issue #67): `/v1/reports/pilot`, cartão no painel e
  `docs/pilot.md` com go-live, rotina e rollback. O piloto real depende do número oficial e do token
  permanente da Meta. `verify` e `test:e2e` verdes (21 arquivos, 122 testes).
- **Proteção de `main`:** não disponível no plano atual do repositório privado; PR + CI `verify`
  continuam obrigatórios por convenção até o repo ser público/Pro.

Branch atual do tech lead: `main`. Como o dev sênior está fora, o tech lead assumiu todas as
tarefas; o worktree `C:\Users\victor\CRM-senior` permanece disponível.

`main` local = `origin/main`. O arquivo `apps/api/.env` existe localmente, está ignorado pelo Git
e guarda a configuração live.

### O que entrou no B0

- Governança: `AGENTS.md`, `docs/backend-plan.md`, `docs/agent-protocol.md`,
  `docs/review-checklist.md`, `docs/tasks.md` e `docs/backend-contract.md`.
- GitHub: issues #2–#21, CI em `.github/workflows/ci.yml` e PR template.
- Schema/migration `0002_abnormal_thor.sql`: appointments, templates, cadências, notificações e
  insights de IA; `conversations.ai_enabled`.
- Contratos Zod/tipos em `packages/shared`; flags de worker/IA/simulador em `config/env.ts`.
- Simulador `POST /v1/dev/simulate-inbound` (autenticado; só com `ENABLE_DEV_SIMULATOR=true`).
- Preview com `ENABLE_DEV_SIMULATOR=true`, dois templates aprovados e cadência ativa de exemplo.
- Scripts `verify` e `test:e2e`; `apps/api/test/e2e.test.ts` cobre login, inbound, lead,
  dashboard, configuração e envio manual.

## Stack e ambiente

- Monorepo TypeScript: API Fastify 5 + painel Next.js 16/React 19/Tailwind 4.
- Banco de produção: PostgreSQL 17 + Drizzle. Redis está reservado para etapas futuras.
- Prévia local sem Docker: PGlite.
- Testes: Vitest + PGlite.
- Windows: usar `npm.cmd`; Docker/PostgreSQL/Redis não estão instalados nesta máquina.
- API local: `http://127.0.0.1:3333`.
- Painel local: `http://localhost:3000`.
- Login de demonstração: `admin@clinica.demo` / `ChangeMe123!`.
- Também existem `gerente@clinica.demo` e `sdr@clinica.demo` com a mesma senha de demo.
- Banco demo: `apps/api/.pglite-preview`.
- Banco live temporário: `C:/Users/victor/AppData/Local/Temp/opencode/crm-pglite-live`.

## O que a Etapa 2 entrega

- Cadastro manual de leads com deduplicação por telefone normalizado.
- Listagem com filtros, busca, status, responsável e unread.
- Detalhe do lead com qualificação, consentimento, opt-out, histórico e edição.
- Webhook oficial da WhatsApp Cloud API:
  - `GET /webhooks/whatsapp` valida o desafio da Meta.
  - `POST /webhooks/whatsapp` valida `X-Hub-Signature-256` com HMAC-SHA256.
  - Eventos idempotentes em `webhook_events`.
  - Mensagens idempotentes por `provider_message_id`.
- Criação/atualização automática de lead e conversa.
- Primeiro atendimento automático configurável, enviado uma única vez.
- Detecção de opt-out e bloqueio de contatos proativos.
- Envio manual de texto dentro da janela de 24 horas; fora dela retorna
  `OUTSIDE_SERVICE_WINDOW` (templates ficam para a Etapa 5).
- Takeover humano: envio manual marca conversa e lead como atendimento humano.
- Atualização de status de entrega/leitura pelo webhook.
- Caixa de conversas, dashboard básico e configuração da conta WhatsApp.
- Conta WhatsApp com `phone_number_id` único por clínica; credenciais nunca vão ao banco.
- RBAC: SDR vê apenas os próprios leads; admin/gerente veem a clínica.
- Auditoria das ações relevantes.

## Endpoints principais

- `GET /health`
- `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`
- `GET /v1/auth/me`, `POST /v1/auth/change-password`
- `GET/POST /v1/leads`
- `GET/PATCH /v1/leads/:leadId`
- `POST /v1/leads/:leadId/messages`
- `GET /v1/conversations`
- `GET /v1/dashboard/summary`
- `GET/PATCH /v1/whatsapp/account`
- `POST /v1/dev/simulate-inbound` (apenas com `ENABLE_DEV_SIMULATOR=true`)
- `GET/POST /webhooks/whatsapp`

## Validação já executada

- `npm.cmd run lint`: passou no baseline; rodar novamente no B0.
- `npm.cmd run typecheck`: passou após as mudanças do B0.
- `npm.cmd test`: 19 arquivos, 103 testes, todos passando após o SD-07.
- `npm.cmd run test:e2e`: 1 fluxo headless passando (login, inbound, lead, dashboard,
  configuração e envio manual).
- `npm.cmd run build`: passou no `verify` do SD-07, incluindo Next.js.
- `npm.cmd run verify`: passou (lint, typecheck, 103 testes e build).
- Prévia web/API em modo dry-run: login, leads, detalhe, conversas, dashboard e configurações
  responderam 200.
- Webhook público via túnel: `/health` 200 e desafio `GET /webhooks/whatsapp` 200 com o token
  antigo de dry-run.
- Docker Compose, PostgreSQL real e Redis ainda não foram validados nesta máquina.

## Estado da validação live

Configuração local em `apps/api/.env` (ignorado pelo Git): `WHATSAPP_MODE=live`, verify token, app
secret, access token temporário, phone number ID, WABA ID, número de teste e `PREVIEW_DATA_DIR`
apontando para o banco PGlite live temporário. Nenhum valor de segredo é registrado aqui.

O arquivo `docs/phone number de teste.txt` contém credenciais de teste e está no `.gitignore`;
deve ser removido do workspace. O token temporário expira em poucas horas e precisa ser gerado
novamente na Meta e atualizado em `apps/api/.env` antes de cada nova rodada de validação.

Resultado da validação em 26/11/2026:

- `GET /webhooks/whatsapp`: challenge aceito com o verify token; token errado retorna 403.
- `POST /webhooks/whatsapp`: assinatura inválida retorna 401; assinatura válida com HMAC do app
  secret processou o evento.
- Inbound assinado criou lead e conversa; resposta automática foi enviada pela Cloud API
  (`status=sent`, com `providerMessageId`).
- Reenvio do mesmo `id` de mensagem retornou `processed=0, ignored=1` (idempotência).
- `POST /v1/leads/:id/messages` enviou mensagem manual com `status=sent`.
- Logs de requisição redactionam `hub.verify_token`, `access_token` e parâmetros sensíveis.

O túnel Cloudflare usado na validação foi encerrado ao final; para repetir o teste, suba um novo
túnel e atualize o callback na Meta. A API local permanece em `http://127.0.0.1:3333`.

## Como obter as credenciais da Meta

1. Acesse `https://developers.facebook.com/apps` com a conta administradora.
2. Se necessário, crie um app com o caso de uso **“Conectar com clientes pelo WhatsApp”** e
   vincule um portfólio empresarial.
3. Em painéis novos, abra **Use cases → Connect with customers through WhatsApp → Customize →
   Connect on WhatsApp → Basic setup → Step 1: Try it out**; em painéis antigos, **WhatsApp →
   Configuração da API** (API Setup).
4. Selecione o número de teste em **From**. A tela mostra:
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`;
   - **WhatsApp Business Account ID / Messaging account ID** → `WHATSAPP_WABA_ID`;
   - **Generate access token** → `WHATSAPP_ACCESS_TOKEN` temporário (começa com `EAA...`).
5. Em **Send a message from your test number → To → manage/add recipient**, adicione e confirme o
   WhatsApp que receberá o teste. Sem destinatário autorizado, a Cloud API responde
   `(#131005) Access denied`. O número pessoal é o destinatário, não o número da API.
6. Abra **Configurações do app → Básico** e copie **App secret** → `WHATSAPP_APP_SECRET`.
7. Preencha `apps/api/.env`. Não cole tokens no chat nem em arquivos versionados.

O token temporário expira em poucas horas. Para algo duradouro, criar um usuário de sistema no
Business Manager, atribuir o app e a WABA e gerar token com `whatsapp_business_messaging`,
`whatsapp_business_management` e `business_management`.

## Checklist da validação live (executado)

1. Credenciais preenchidas em `apps/api/.env` e token confirmado na Graph API
   (`verified_name=Test Number`).
2. API reiniciada com `npm.cmd run preview:api` em `WHATSAPP_MODE=live`.
3. Webhook configurado na Meta com callback HTTPS, verify token e campo `messages`; app inscrito
   na WABA.
4. Assinatura HMAC validada: POST sem assinatura correta retorna 401.
5. Inbound assinado processado: lead e conversa criados, mensagem inbound gravada.
6. Resposta automática e envio manual retornaram `status=sent` com `providerMessageId` real.
7. Reenvio do mesmo evento retornou `processed=0, ignored=1`.
8. Túnel encerrado; segredos não versionados nem registrados em logs/documentação.

Para repetir, gere um token novo, atualize `apps/api/.env`, reinicie a API e suba um novo túnel.
Use `taskkill` apenas com encerramento graceful: o PGlite pode perder escritas recentes se o
processo for morto com `/F`.

## Comandos úteis

```powershell
# API em modo prévia (carrega apps/api/.env)
npm.cmd run preview:api

# Painel
npm.cmd run dev:web

# Validações
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test

# Build (parar o Next dev antes)
npm.cmd run build
```

Processos e logs atuais:

- API: porta 3333, log em `C:\Users\victor\AppData\Local\Temp\opencode\crm-live-api.log`.
- Web: porta 3000, log em `C:\Users\victor\AppData\Local\Temp\opencode\crm-preview-web.log`.
- Túnel: `cloudflared`, log em `C:\Users\victor\AppData\Local\Temp\opencode\crm-cloudflared.log`.

No Windows, para encerrar a API: localizar o PID com
`Get-NetTCPConnection -LocalPort 3333` e executar `taskkill /PID <pid> /T /F`.

## Limitações conhecidas

- Mídias recebidas são registradas como tipo + placeholder; não há download ou visualização do
  arquivo.
- O primeiro atendimento é marcado como enviado antes da chamada à Meta; falha de envio é
  registrada, mas não há retry automático.
- Webhook é processado de forma síncrona na requisição; pode sofrer timeout sob carga.
- Fora da janela de 24h o envio de texto é bloqueado; templates e cadências já estão entregues.
- IA é assistiva e não responde dúvidas clínicas; Kanban e agenda nativa são etapas seguintes.
- PGlite é apenas para prévia; produção exige PostgreSQL.
- App da Meta em modo de desenvolvimento aceita apenas destinatários autorizados.
- A validação Docker/VPS continua pendente.

## Arquivos relevantes

- `apps/api/src/modules/whatsapp/webhook.service.ts`: assinatura, idempotência, lead/conversa,
  opt-out, primeiro atendimento e status.
- `apps/api/src/modules/whatsapp/whatsapp.client.ts`: cliente Cloud API + dry-run.
- `apps/api/src/modules/whatsapp/whatsapp.service.ts`: conta WhatsApp e auditoria.
- `apps/api/src/modules/leads/leads.service.ts`: leads, conversas, envio manual e janela de 24h.
- `apps/api/src/modules/dashboard/dashboard.service.ts`: métricas.
- `apps/api/src/db/schema/index.ts` e `apps/api/drizzle/0001_true_terror.sql`: schema/migration.
- `apps/api/src/config/env.ts`: validação de ambiente e modo live.
- `apps/api/dev-preview.ts`: prévia PGlite; agora aceita credenciais live via ambiente.
- `apps/api/test/leads.test.ts`, `apps/api/test/helpers.ts`: cobertura da Etapa 2.
- `apps/web/src/app/(app)/leads`, `conversas`, `dashboard`, `configuracoes`: telas.
- `docs/architecture.md` e `docs/deploy.md`: arquitetura e deploy.
- `apps/api/.env`: configuração live local, ignorada pelo Git.

## Prompt para a próxima seção

> Leia `docs/handoff.md` e `docs/pilot.md`: B0–B5, F e Etapas 3–7 do README estão concluídos/prontos.
> O piloto depende apenas de número oficial e token permanente da Meta. Para retomar a integração
> live, gere um token novo, reinicie a prévia e configure um novo túnel; nunca exponha nem versione
> tokens.
