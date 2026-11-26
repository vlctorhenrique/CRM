# Contexto atual e handoff

Atualizado em 24/11/2026. Este documento resume o estado do projeto para continuar em outra
seção. Ele não contém tokens nem segredos.

## Status

- **Etapa 1 — Fundação:** concluída; commits originais `198fd4b`/`350be1c` preservados na
  branch `backup/local-main-350be1c`.
- **Etapa 2 — CRM e WhatsApp:** concluída e reconciliada no PR #1.
- **Etapa 2 — validação live:** pendente; faltam credenciais da Meta.
- **B0 — Fundação da Etapa 3:** concluído e mergeado na `main` em `09b7703` (PR #23); issues
  #2–#4 fechadas.
- **SD-01 — Utilitários puros:** concluído e mergeado em `80a815d` (PR #22): extrator
  determinístico, horário comercial e render de templates. `confidence` vem em 0-1; converter
  para 0-100 ao persistir em B3.
- **B1 — Leads/agenda/consentimento:** concluído. TL-04 em `c2c121d` (PR #26) entregou filtro
  `assignment`, claim/release idempotentes e consentimento auditado; SD-02 em `e84ea23` (PR #29)
  entregou CRUD de agendamentos com RBAC, conflitos, transições e notificações; TL-05 integra seed
  e e2e (PR em andamento).
- **B2–B5:** planejadas em `docs/backend-plan.md`.
- **Proteção de `main`:** não disponível no plano atual do repositório privado; PR + CI `verify`
  continuam obrigatórios por convenção até o repo ser público/Pro.

Branch atual do tech lead: `feat/b1-integration` (seed/e2e do B1). Como o dev sênior está fora, o
tech lead também assumiu SD-02; o worktree `C:\Users\victor\CRM-senior` permanece disponível.

`main` local = `origin/main` em `e84ea23`. O arquivo `apps/api/.env` existe localmente, está
ignorado pelo Git e guarda a configuração live.

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
- `npm.cmd test`: 11 arquivos, 81 testes, todos passando após o B1.
- `npm.cmd run test:e2e`: 1 fluxo headless passando (login, inbound, lead, dashboard,
  configuração e envio manual).
- `npm.cmd run build`: passou no `verify` do SD-01, incluindo Next.js.
- `npm.cmd run verify`: passou (lint, typecheck, 81 testes e build).
- Prévia web/API em modo dry-run: login, leads, detalhe, conversas, dashboard e configurações
  responderam 200.
- Webhook público via túnel: `/health` 200 e desafio `GET /webhooks/whatsapp` 200 com o token
  antigo de dry-run.
- Docker Compose, PostgreSQL real e Redis ainda não foram validados nesta máquina.

## Estado da validação live

Configuração local em `apps/api/.env` (ignorado pelo Git):

- `WHATSAPP_MODE=live`
- `WHATSAPP_VERIFY_TOKEN`: preenchido com token aleatório de 64 caracteres.
- `WHATSAPP_PHONE_NUMBER`: preenchido com um número pessoal; para o teste deve ser trocado pelo
  número de teste exibido pela Meta.
- `WHATSAPP_APP_SECRET`: **vazio**.
- `WHATSAPP_ACCESS_TOKEN`: **vazio**.
- `WHATSAPP_PHONE_NUMBER_ID`: **vazio**.
- `WHATSAPP_WABA_ID`: **vazio**.
- `PREVIEW_DATA_DIR` aponta para o banco PGlite live temporário.

A API na porta 3333 ainda está rodando o processo antigo em dry-run. Ela precisa ser reiniciada
depois de preencher as credenciais para carregar `apps/api/.env` e o código novo da prévia.

Túnel HTTPS atual (Cloudflare Quick Tunnel):

- URL: `https://babies-assists-released-seems.trycloudflare.com`
- Callback para a Meta: `https://babies-assists-released-seems.trycloudflare.com/webhooks/whatsapp`
- O túnel encaminha para `http://127.0.0.1:3333`.
- O URL muda se o `cloudflared` for reiniciado; nesse caso atualize a Meta.
- Binário: `C:\Users\victor\AppData\Local\Temp\opencode\cloudflared.exe`
- Log: `C:\Users\victor\AppData\Local\Temp\opencode\crm-cloudflared.log`

O token de verificação está em `apps/api/.env`; não copie o valor para este documento nem para o
Git. Se precisar de outro, gere 32 bytes aleatórios e atualize a Meta.

## Como obter as credenciais da Meta

1. Acesse `https://developers.facebook.com/apps` com a conta administradora.
2. Se necessário, crie um app com o caso de uso **“Conectar com clientes pelo WhatsApp”** e
   vincule um portfólio empresarial.
3. Abra **WhatsApp → Configuração da API** (API Setup).
4. Selecione o número de teste em **From**. A tela mostra:
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`;
   - **WhatsApp Business Account ID / Messaging account ID** → `WHATSAPP_WABA_ID`;
   - **Generate access token** → `WHATSAPP_ACCESS_TOKEN` temporário (começa com `EAA...`).
5. Em **To → Manage phone number list**, adicione e confirme o WhatsApp pessoal que receberá o
   teste. O número pessoal é o destinatário, não o número da API.
6. Abra **Configurações do app → Básico** e copie **App secret** → `WHATSAPP_APP_SECRET`.
7. Preencha `apps/api/.env`. Não cole tokens no chat nem em arquivos versionados.

O token temporário expira em poucas horas. Para algo duradouro, criar um usuário de sistema no
Business Manager, atribuir o app e a WABA e gerar token com `whatsapp_business_messaging`,
`whatsapp_business_management` e `business_management`.

## Próximos passos da validação live

1. Preencher as quatro credenciais pendentes em `apps/api/.env`.
2. Trocar `WHATSAPP_PHONE_NUMBER` pelo número de teste exibido na Meta.
3. Opcional: validar o número e a WABA na Graph API:
   `GET https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}?fields=display_phone_number,verified_name&access_token=...`
4. Parar a API atual na porta 3333 e iniciar novamente com `npm.cmd run preview:api`.
   O novo banco live será criado vazio, com tenant/usuários/leads demo e a conta WhatsApp já usando
   o phone number ID real.
5. Confirmar no log que a API subiu em modo live e que o seed criou a conta.
6. Na Meta, abrir **WhatsApp → Configuração → Webhook → Editar** e configurar:
   - Callback URL do túnel + `/webhooks/whatsapp`;
   - o verify token de `apps/api/.env`;
   - campo `messages`.
     A API precisa já estar reiniciada em live para a verificação funcionar.
7. Se necessário, assinar o app na WABA:
   `POST https://graph.facebook.com/v23.0/{WABA_ID}/subscribed_apps` com o access token.
8. Enviar uma mensagem de outro WhatsApp para o número de teste.
9. Verificar:
   - webhook aceito e evento processado;
   - lead criado/deduplicado;
   - conversa e mensagem no painel;
   - resposta automática recebida no WhatsApp;
   - segundo webhook repetido sem duplicar dados.
10. Registrar o resultado, parar o túnel, voltar a prévia para dry-run e decidir se a alteração da
    prévia live será commitada.

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

- API: porta 3333, log em `C:\Users\victor\AppData\Local\Temp\opencode\crm-preview-api.log`.
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
- Fora da janela de 24h o envio é bloqueado; templates e cadências são Etapa 5.
- Não há IA, Kanban, agendamento nativo, notificações nem relatórios avançados ainda.
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

> Leia `docs/handoff.md` e continue a validação live da Etapa 2 a partir do estado atual. Não
> exponha nem versione tokens. Primeiro confira `git status` e quais campos de `apps/api/.env`
> estão preenchidos.
