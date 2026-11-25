# Log do dev senior

## 2026-11-24 - SD-01 utilitarios de dominio

- Tarefa: SD-01 (extracao deterministica de IA, horario comercial e renderizacao de templates).
- Branch: feat/sd-01-utils (worktree separado).
- Contexto: origin/main (a11f96e) ainda nao contem docs/backend-contract.md; escopo limitado a SD-01.
- Decisoes:
  - Extracao deterministica por palavras-chave normalizadas (sem acentos), sem LLM.
  - `previousTreatment` como `boolean | null`, priorizando negacao quando aparece antes de afirmacao.
  - Resumo usa o proprio texto normalizado e truncado em 280 caracteres, sem inventar dados.
  - Horario comercial reutiliza `BusinessHours` de `@crm/shared`; conversao de fuso com `Intl`.
  - Fim da janela de atendimento e exclusivo; feriados comparados pela data local do fuso.
  - Templates retornam erros estruturados (sem lancar excecao) e preview truncado em 280.
- Testes: 44 novos casos em `ai-extraction.test.ts` e `cadence-utils.test.ts`.
- Comandos: `npm run typecheck -w @crm/api` e `npm run test -w @crm/api` verdes (67 testes).
- Bloqueios: `npm run lint` permanece vermelho por 3 erros pre-existentes em arquivos do tech lead
  (`apps/api/dev-preview.ts:235`, `apps/api/src/modules/leads/leads.service.ts:255` e import nao
  usado na linha 17). Nenhum arquivo central alterado.
- Proximo passo: aguardar review do PR; apos o contrato v0 seguir SD-02 (appointments).
