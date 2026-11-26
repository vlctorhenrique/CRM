# CRM Clínicas

CRM comercial para clínicas de estética e emagrecimento, construído a partir do PRD v1.1. O produto começa com uma clínica, mas nasce preparado para operação multiempresa.

**Status atual: B1–B4 e frontend entregues; integração live da Meta pendente de credenciais.**

## O que já existe

- Monorepo TypeScript com API Fastify e painel Next.js.
- Autenticação com Argon2id, JWT de acesso curto e refresh token opaco armazenado com hash.
- Cookies HttpOnly, SameSite Lax e Secure em produção.
- Multiempresa com `tenant_id` em todas as tabelas de negócio e isolamento nas consultas.
- RBAC com administrador, gerente e SDR.
- Trilha de auditoria para login, logout, troca de senha e gestão de usuários/clínica.
- Troca de senha pelo próprio usuário, com revogação das outras sessões.
- Dashboard, shell responsivo, tela de equipe e navegação entre todos os módulos.
- Fila de não atribuídos, claim/release de leads e consentimento explícito com evidência.
- Agendamentos manuais com RBAC, conflito de horário, transições de status e notificações.
- Templates com variáveis validadas, cadências com inscrição elegível e worker no processo da API.
- Limites de horário comercial, retry com backoff, opt-out e pausa por resposta humana.
- IA assistiva silenciosa com fallback determinístico e LLM opcional (`AI_MODE`).
- Relatórios de funil, agenda, cadências e mensagens, além de health com backlog.
- Páginas de agenda, cadências, relatórios, notificações e insights de IA no detalhe do lead.
- Leads com cadastro manual, deduplicação por telefone, filtros, responsável e pipeline de status.
- Recebimento pela WhatsApp Cloud API oficial com validação de assinatura HMAC e idempotência.
- Criação automática de lead e conversa, primeiro atendimento configurável e histórico de mensagens.
- Opt-out automático, bloqueio de envio fora da janela de 24 horas e envio manual registrado.
- Caixa de conversas, detalhe do lead com qualificação e tela de configuração do WhatsApp.
- PostgreSQL, Redis, migrations com Drizzle, seed idempotente e testes de integração com PGlite.
- Docker Compose, Nginx, health checks, scripts de backup/restauração e documentação de deploy.
- Rate limit global e específico no login, CORS restrito, Helmet e validação com Zod.

## Stack

| Camada        | Tecnologia                                   |
| ------------- | -------------------------------------------- |
| Frontend      | Next.js 16, React 19, Tailwind CSS 4         |
| Backend       | Node.js 24, Fastify 5, TypeScript            |
| Banco         | PostgreSQL 17 + Drizzle ORM                  |
| Filas e cache | PostgreSQL para fila; Redis 7 opcional       |
| Autenticação  | Argon2id + JWT (`jose`) + cookies HttpOnly   |
| Testes        | Vitest + PGlite                              |
| Infra         | Docker Compose, Nginx                        |
| IA            | Fallback local + OpenAI opcional (`AI_MODE`) |

## Estrutura

```
apps/
  api/        API Fastify, autenticação, RBAC, schema e migrations
  web/        Painel Next.js, proxy de API e interface
packages/
  shared/     Schemas Zod, tipos, permissões e utilitários compartilhados
nginx/        Configuração do proxy e exemplo de HTTPS no host
scripts/      Backup e restauração do PostgreSQL
docs/         Arquitetura e guia de deploy
```

## Subindo com Docker

Pré-requisitos: Docker Engine 24+ e Docker Compose v2.

```bash
cp .env.example .env
```

Edite o `.env` antes de subir:

- Gere um `JWT_SECRET` com pelo menos 32 caracteres:
  `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`
- Defina `POSTGRES_PASSWORD` com valor forte e compatível com URL (evite `@ : / # %`).
- Defina `SEED_ADMIN_PASSWORD` com uma senha forte.
- Em produção, use `SEED_DEMO_USERS=false` e `NEXT_PUBLIC_SHOW_DEMO_HINTS=false`.
- Para o WhatsApp, comece com `WHATSAPP_MODE=dry-run`; em produção use `live` e preencha
  `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN` e
  `WHATSAPP_PHONE_NUMBER_ID`.
- Na Meta, configure o webhook público em `https://seu-dominio/webhooks/whatsapp` com o mesmo
  verify token do `.env`. O Nginx encaminha essa rota para a API.

```bash
docker compose up -d --build
docker compose exec api node apps/api/dist/db/seed.js
```

Acesse `http://localhost:8080`.

Com `SEED_DEMO_USERS=true`, o seed cria:

| Perfil        | E-mail                 | Senha                          |
| ------------- | ---------------------- | ------------------------------ |
| Administrador | `admin@clinica.demo`   | valor de `SEED_ADMIN_PASSWORD` |
| Gerente       | `gerente@clinica.demo` | valor de `SEED_ADMIN_PASSWORD` |
| SDR           | `sdr@clinica.demo`     | valor de `SEED_ADMIN_PASSWORD` |

As migrations rodam automaticamente no start do container da API. A troca de senha está disponível em **Configurações**.

## Desenvolvimento local

Pré-requisitos: Node.js 24+, npm 11+ e infraestrutura PostgreSQL/Redis.

```bash
npm ci
docker compose up -d postgres redis
cp .env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
npm run db:migrate
npm run db:seed
npm run dev
```

- Painel: `http://localhost:3000`
- API: `http://localhost:3333`
- Documentação da API (com `ENABLE_API_DOCS=true`): `http://localhost:3333/docs`

O painel usa o proxy interno `/api/backend/*`, então os cookies permanecem de primeira parte e não há CORS no navegador.

### Prévia sem Docker/PostgreSQL

Para validar a aplicação rapidamente, o modo de prévia usa PGlite (PostgreSQL embutido) e dados de
demonstração. O banco fica em `apps/api/.pglite-preview`, ignorado pelo Git.

```bash
npm run preview:api
npm run dev:web
```

- Painel: `http://localhost:3000`
- API: `http://localhost:3333`
- Login: `admin@clinica.demo` / `ChangeMe123!` (ou defina `SEED_ADMIN_PASSWORD`)
- WhatsApp em `dry-run`, com conta e leads de demonstração criados pelo seed.
- Para simular um webhook: `POST http://localhost:3333/webhooks/whatsapp` com assinatura
  `X-Hub-Signature-256` usando o `WHATSAPP_APP_SECRET` (`preview-app-secret` por padrão).
- Para simular uma mensagem sem assinatura, autentique-se e use
  `POST /v1/dev/simulate-inbound` com `{ "phone": "11999998888", "text": "Quero botox" }`.
  O simulador só existe com `ENABLE_DEV_SIMULATOR=true` e fora de produção.

Para recomeçar do zero, pare a API e remova `apps/api/.pglite-preview`.

## Scripts

| Comando               | Descrição                                     |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | Compila o shared e sobe API + painel          |
| `npm run preview:api` | Sobe a API com PGlite e dados de demonstração |
| `npm run build`       | Build de shared, API e painel                 |
| `npm run typecheck`   | Typecheck dos três workspaces                 |
| `npm run lint`        | Biome check                                   |
| `npm run lint:fix`    | Biome com correções seguras                   |
| `npm test`            | Testes de integração/unitários da API         |
| `npm run test:e2e`    | Fluxo headless completo com PGlite            |
| `npm run verify`      | Lint + typecheck + testes + build             |
| `npm run db:generate` | Gera migration a partir do schema Drizzle     |
| `npm run db:migrate`  | Aplica migrations                             |
| `npm run db:seed`     | Cria clínica, admin e usuários demo opcionais |
| `npm run db:studio`   | Abre o Drizzle Studio                         |

## Endpoints principais

| Método | Rota                         | Acesso                |
| ------ | ---------------------------- | --------------------- |
| GET    | `/health`                    | Público               |
| POST   | `/v1/auth/login`             | Público, rate limit   |
| POST   | `/v1/auth/refresh`           | Cookie de refresh     |
| POST   | `/v1/auth/logout`            | Cookie de refresh     |
| GET    | `/v1/auth/me`                | Autenticado           |
| POST   | `/v1/auth/change-password`   | Autenticado           |
| GET    | `/v1/users`                  | Admin e gerente       |
| POST   | `/v1/users`                  | Admin                 |
| PATCH  | `/v1/users/:userId`          | Admin                 |
| GET    | `/v1/tenants/current`        | Autenticado           |
| PATCH  | `/v1/tenants/current`        | Admin                 |
| GET    | `/v1/leads`                  | Autenticado           |
| POST   | `/v1/leads`                  | Autenticado           |
| GET    | `/v1/leads/:leadId`          | Autenticado           |
| PATCH  | `/v1/leads/:leadId`          | Autenticado           |
| POST   | `/v1/leads/:leadId/messages` | Autenticado           |
| GET    | `/v1/conversations`          | Autenticado           |
| GET    | `/v1/dashboard/summary`      | Autenticado           |
| GET    | `/v1/whatsapp/account`       | Autenticado           |
| PATCH  | `/v1/whatsapp/account`       | Admin                 |
| GET    | `/webhooks/whatsapp`         | Público (verificação) |
| POST   | `/webhooks/whatsapp`         | Público (assinado)    |

## Segurança e LGPD

- Senhas nunca são registradas em logs ou respostas.
- Tokens ficam em cookies HttpOnly; o refresh token é persistido apenas como hash SHA-256.
- O access token expira em 30 minutos; o refresh em 30 dias e pode ser revogado.
- Trocar a senha impede a renovação das demais sessões do usuário.
- Toda consulta de negócio é filtrada pelo `tenant_id` do token.
- A SDR acessa apenas os próprios leads; administradores e gerentes veem a clínica.
- O seed nunca imprime senhas.
- Enviar mensagem ao WhatsApp não representa consentimento amplo; o consentimento é registrado
  separadamente e o opt-out bloqueia novos envios imediatamente.
- Access token e app secret do WhatsApp ficam apenas em variáveis de ambiente, nunca no banco.
- O histórico do WhatsApp pode conter dados sensíveis; defina retenção e base legal antes da operação.
- CPF e dados clínicos detalhados ainda não são coletados nesta etapa.
- Antes da operação, a clínica deve validar consentimento, retenção e base legal com assessoria jurídica.

## Próximas etapas

1. **Etapa 3** — IA assistiva para extração, classificação e resumo, com modo silencioso.
2. **Etapa 4** — Pipeline/Kanban, permissões da SDR e registro manual de agendamento.
3. **Etapa 5** — Fila de elegíveis, seleção, templates, cadências de até sete dias, opt-out e idempotência.
4. **Etapa 6** — Indicadores, notificações, backup monitorado e testes de aceitação.
5. **Etapa 7** — Piloto com uma clínica e um número oficial.

A integração com o UNO e a agenda nativa estão fora do MVP, conforme o adendo v1.1.

## Documentação

- [Arquitetura](docs/architecture.md)
- [Deploy em VPS](docs/deploy.md)
- [Contexto atual e handoff](docs/handoff.md)
