# Checklist de review

## Escopo

- O PR resolve apenas a tarefa e não mistura refatorações não pedidas.
- Arquivos fora do ownership não foram alterados sem pedido explícito.

## Segurança e LGPD

- Nenhum segredo, token, `.env` ou dado real no diff.
- Logs não expõem telefone completo, conteúdo clínico ou credenciais.
- Consentimento explícito tem evidência e versão do texto.
- Opt-out bloqueia envio e cancela cadências.

## Multiempresa e RBAC

- Toda consulta e escrita filtra `tenant_id`.
- SDR só acessa próprios leads e a fila de não atribuídos.
- Rotas administrativas exigem papel correto.
- IDs de outro tenant retornam 404, não 403.

## Dados e idempotência

- Webhook, worker e jobs de IA são idempotentes.
- Transições de status são validadas e auditadas.
- Datas usam timezone da clínica.
- Limites de tentativa e retry têm backoff e erro registrado.

## Testes

- Caminho feliz e erros relevantes cobertos.
- Testes não dependem de rede, Meta, OpenAI ou relógio real sem controle.
- `npm.cmd run verify` verde.

## Contrato e documentação

- Endpoints, erros e permissões documentados em `docs/backend-contract.md`.
- Migration/schema somente pelo tech lead.
- `docs/tasks.md` e `docs/handoff.md` atualizados após o merge.
- PR descreve wiring pendente e riscos.
