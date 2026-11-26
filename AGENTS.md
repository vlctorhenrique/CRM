# AGENTS.md

## Visão do projeto

CRM comercial para clínicas de estética e emagrecimento, construído a partir do PRD v1.1.
O produto começa com uma clínica, mas é multiempresa desde o primeiro dia.

- API: `apps/api` (Fastify 5, Drizzle, PostgreSQL/PGlite, Vitest)
- Painel: `apps/web` (Next.js 16, React 19, Tailwind 4)
- Contratos: `packages/shared` (Zod + tipos)
- Documentação: `docs/`

## Papéis

- **Tech lead**: contratos, schema/migrations, `app.ts`, `server.ts`, config, worker de cadências,
  webhook, Meta live, CI, revisão e merge.
- **Dev sênior**: módulos independentes e páginas atribuídas no board, sempre via PR.

## Comandos

Windows: use `npm.cmd`.

```powershell
npm.cmd ci
npm.cmd run dev            # shared + API + painel
npm.cmd run preview:api    # API com PGlite e seed demo
npm.cmd run dev:web
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run verify         # lint + typecheck + test + build
```

Login demo: `admin@clinica.demo` / `ChangeMe123!`.
API: `http://127.0.0.1:3333`. Painel: `http://localhost:3000`.

## Ownership

O tech lead é dono exclusivo de:

- `packages/shared/src/index.ts`
- `apps/api/src/db/schema/**`
- `apps/api/drizzle/**`
- `apps/api/src/app.ts`, `apps/api/src/server.ts`
- `apps/api/src/config/env.ts`, `apps/api/src/db/seed.ts`, `apps/api/dev-preview.ts`
- `package.json`, `package-lock.json`, `.env*`
- `.github/**`, `README.md`, `AGENTS.md`, `docs/handoff.md`, `docs/backend-contract.md`,
  `docs/tasks.md`

O dev sênior é dono dos arquivos dos módulos atribuídos no board e de
`docs/agent-log/senior-dev.md`. Mudanças fora do ownership precisam ser pedidas no PR.

## Convenções

- TypeScript ESM, imports com `.js` na API.
- Biome: aspas simples, sem ponto e vírgula, vírgula final, largura 100.
- Não adicionar comentários desnecessários.
- Não adicionar dependências sem aprovação do tech lead.
- Validação de entrada com Zod em `packages/shared` ou no módulo.
- Toda consulta de negócio filtra `tenant_id`.
- RBAC explícito em rotas administrativas.
- Dinheiro, datas e fusos: usar timezone da clínica (`America/Sao_Paulo` por padrão).
- Idempotência obrigatória em webhook, worker de cadência e jobs de IA.
- Logs não podem conter tokens, segredos, telefone completo ou conteúdo clínico.

## Definition of Done

- Testes novos/atualizados cobrindo caminho feliz e erros relevantes.
- `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test` e `npm.cmd run build` verdes.
- Sem segredos, dados reais, chamadas reais à Meta/OpenAI ou force push.
- Migrations/schema apenas pelo tech lead.
- PR com objetivo, como testar, riscos e pendências de wiring.
- Documentação/log atualizado quando aplicável.

## Segurança e LGPD

- Nunca commitar `.env`, tokens, credenciais ou dados de pacientes.
- Consentimento não é implícito por enviar mensagem; registrar evidência e versão do texto.
- Opt-out bloqueia novos envios imediatamente e cancela cadências.
- Mídia e dados clínicos detalhados estão fora do MVP.
- A integração Meta começa em `dry-run`; `live` só com credenciais e validação explícita.

## Contexto

- PRD: `PRD_CRM_Clinicas_Estetica_v1_1.docx`
- Plano: `docs/backend-plan.md`
- Contrato: `docs/backend-contract.md`
- Board: `docs/tasks.md`
- Protocolo: `docs/agent-protocol.md`
- Handoff: `docs/handoff.md`
