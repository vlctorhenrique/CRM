# CRM Clínicas

CRM comercial para clínicas de estética e emagrecimento, construído a partir do PRD v1.1. O produto começa com uma clínica, mas nasce preparado para operação multiempresa.

**Status atual: Etapa 1 — Fundação concluída.**

## O que já existe

- Monorepo TypeScript com API Fastify e painel Next.js.
- Autenticação com Argon2id, JWT de acesso curto e refresh token opaco armazenado com hash.
- Cookies HttpOnly, SameSite Lax e Secure em produção.
- Multiempresa com `tenant_id` em todas as tabelas de negócio e isolamento nas consultas.
- RBAC com administrador, gerente e SDR.
- Trilha de auditoria para login, logout, troca de senha e gestão de usuários/clínica.
- Troca de senha pelo próprio usuário, com revogação das outras sessões.
- Dashboard, shell responsivo, tela de equipe e roadmap dos módulos.
- PostgreSQL, Redis, migrations com Drizzle, seed idempotente e testes de integração com PGlite.
- Docker Compose, Nginx, health checks, scripts de backup/restauração e documentação de deploy.
- Rate limit global e específico no login, CORS restrito, Helmet e validação com Zod.

## Stack

| Camada        | Tecnologia                                    |
| ------------- | --------------------------------------------- |
| Frontend      | Next.js 16, React 19, Tailwind CSS 4          |
| Backend       | Node.js 24, Fastify 5, TypeScript             |
| Banco         | PostgreSQL 17 + Drizzle ORM                   |
| Filas e cache | Redis 7 (reservado para o motor de cadências) |
| Autenticação  | Argon2id + JWT (`jose`) + cookies HttpOnly    |
| Testes        | Vitest + PGlite                               |
| Infra         | Docker Compose, Nginx                         |
| IA            | OpenAI (Etapa 3, ainda não integrada)         |

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

## Scripts

| Comando               | Descrição                                     |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | Compila o shared e sobe API + painel          |
| `npm run build`       | Build de shared, API e painel                 |
| `npm run typecheck`   | Typecheck dos três workspaces                 |
| `npm run lint`        | Biome check                                   |
| `npm run lint:fix`    | Biome com correções seguras                   |
| `npm test`            | Testes de integração/unitários da API         |
| `npm run db:generate` | Gera migration a partir do schema Drizzle     |
| `npm run db:migrate`  | Aplica migrations                             |
| `npm run db:seed`     | Cria clínica, admin e usuários demo opcionais |
| `npm run db:studio`   | Abre o Drizzle Studio                         |

## Endpoints principais

| Método | Rota                       | Acesso              |
| ------ | -------------------------- | ------------------- |
| GET    | `/health`                  | Público             |
| POST   | `/v1/auth/login`           | Público, rate limit |
| POST   | `/v1/auth/refresh`         | Cookie de refresh   |
| POST   | `/v1/auth/logout`          | Cookie de refresh   |
| GET    | `/v1/auth/me`              | Autenticado         |
| POST   | `/v1/auth/change-password` | Autenticado         |
| GET    | `/v1/users`                | Admin e gerente     |
| POST   | `/v1/users`                | Admin               |
| PATCH  | `/v1/users/:userId`        | Admin               |
| GET    | `/v1/tenants/current`      | Autenticado         |
| PATCH  | `/v1/tenants/current`      | Admin               |

## Segurança e LGPD

- Senhas nunca são registradas em logs ou respostas.
- Tokens ficam em cookies HttpOnly; o refresh token é persistido apenas como hash SHA-256.
- O access token expira em 30 minutos; o refresh em 30 dias e pode ser revogado.
- Trocar a senha impede a renovação das demais sessões do usuário.
- Toda consulta de negócio é filtrada pelo `tenant_id` do token.
- A SDR não acessa resultados individuais de outras SDRs.
- O seed nunca imprime senhas.
- CPF e dados clínicos ainda não são coletados nesta etapa.
- Antes da operação, a clínica deve validar consentimento, retenção e base legal com assessoria jurídica.

## Próximas etapas

1. **Etapa 2** — WhatsApp Cloud API, webhook idempotente, leads, deduplicação e caixa de conversas.
2. **Etapa 3** — IA assistiva para extração, classificação e resumo, com modo silencioso.
3. **Etapa 4** — Pipeline/Kanban, permissões da SDR e registro manual de agendamento.
4. **Etapa 5** — Fila de elegíveis, seleção, templates, cadências de até sete dias, opt-out e idempotência.
5. **Etapa 6** — Indicadores, notificações, backup monitorado e testes de aceitação.
6. **Etapa 7** — Piloto com uma clínica e um número oficial.

A integração com o UNO e a agenda nativa estão fora do MVP, conforme o adendo v1.1.

## Documentação

- [Arquitetura](docs/architecture.md)
- [Deploy em VPS](docs/deploy.md)
