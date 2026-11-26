# Plano backend-first

## Objetivo

Entregar o CRM funcional o mais rápido e economicamente possível, com backend completo e
testado antes do frontend. A integração live da Meta fica para a última etapa.

## Princípios

- Contract-first: schema, tipos e endpoints são definidos antes dos módulos.
- Fluxo crítico sob responsabilidade do tech lead; módulos independentes com o dev sênior.
- Sem Redis/BullMQ no MVP: fila e jobs no PostgreSQL, worker no processo da API.
- Sem novas dependências sem necessidade comprovada.
- `dry-run` e simulador local para WhatsApp; IA com fallback determinístico e LLM opcional.
- Cada fase termina com testes, documentação e PR verde.

## Fases

| Fase | Escopo                | Principal entrega                                                 |
| ---- | --------------------- | ----------------------------------------------------------------- |
| B0   | Fundação              | Git reconciliado, CI, simulador, harness, contrato v0             |
| B1   | SDR e agenda          | Fila de não atribuídos, claim/release, consentimento, agendamento |
| B2   | Cadências             | Templates, cadências, worker, opt-out, notificações               |
| B3   | IA assistiva          | Extração/resumo silencioso, fallback, LLM opcional                |
| B4   | Relatórios e robustez | Indicadores, health/backlog, contrato v1                          |
| B5   | Meta live             | Credenciais, staging, validação real                              |
| F    | Frontend              | Agenda, cadências, relatórios, IA e pipeline                      |

## Fora do MVP

- Mídia no WhatsApp, CPF, integração UNO, agenda nativa, múltiplos números e billing.
- Automação total da conversa; IA é assistiva e silenciosa.
- Novas bibliotecas de UI ou gráficos.

## Decisões de arquitetura

- `cadence_tasks` e `ai_insights` funcionam como fila durável com `status`, `attempts`,
  `next_attempt_at` e lock por timestamp.
- Worker roda no processo da API e é desabilitável por env.
- Templates são locais, com status de aprovação e sincronização manual com a Meta.
- Agendamento é manual; ao criar agendamento, tarefas futuras da cadência são canceladas.
- Consentimento explícito exige evidência e versão do texto.
- SDR vê leads próprios e a fila de não atribuídos; admin/gerente veem a clínica.

## Riscos

- Credenciais Meta e aprovação de templates podem atrasar B5; B0-B4 não dependem disso.
- Horário comercial, feriados e fuso precisam de testes determinísticos.
- Duas sessões de agente no mesmo repositório exigem worktrees separados e ownership claro.
- Contrato grande no B0 pode gerar retrabalho; ajustes são centralizados no tech lead.
