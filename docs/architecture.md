# Arquitetura — Etapa 1

## Visão geral

```
Navegador
   |
   | HTTPS
   v
Nginx (TLS no host ou container)
   |
   v
Next.js (painel + proxy /api/backend)
   |
   | HTTP interno
   v
Fastify API
   |            \
   v             v
PostgreSQL     Redis (reservado)
```

O navegador nunca acessa a API diretamente. O Next.js encaminha chamadas de `/api/backend/*` para a API, preservando cookies de primeira parte. Em produção, a API e o Redis não publicam portas; somente o Nginx é exposto.

## Monorepo

- `apps/api`: API, autenticação, RBAC, schema Drizzle, migrations, seed e testes.
- `apps/web`: App Router do Next.js, páginas autenticadas, proxy e componentes de UI.
- `packages/shared`: contratos Zod, tipos, rótulos e utilitários usados pelos dois lados.

O pacote compartilhado é compilado antes da API e do painel. Os scripts raiz garantem a ordem de build.

## Autenticação

1. `POST /v1/auth/login` valida e-mail e senha com Argon2id.
2. Se o e-mail existe em mais de uma clínica, o login exige `tenantSlug`; caso contrário, a clínica é inferida.
3. A API emite:
   - access token JWT HS256, com `sub`, `tid`, `role`, emissor, audiência e expiração de 30 minutos;
   - refresh token opaco de 48 bytes, salvo no banco apenas como SHA-256.
4. Os tokens são entregues em cookies `HttpOnly`, `SameSite=Lax` e `Secure` em produção.
5. `POST /v1/auth/refresh` troca o refresh válido por um novo access token.
6. `POST /v1/auth/logout` revoga o refresh atual e limpa os cookies.
7. `POST /v1/auth/change-password` valida a senha atual, grava o novo hash e revoga os demais refreshes do usuário; os access tokens restantes expiram em até 30 minutos.

Em cada requisição autenticada, a API valida o JWT e confirma no banco se o usuário e a clínica continuam ativos. O papel usado no RBAC é o do banco, não apenas o do token.

## Multiempresa

Todas as entidades de negócio têm `tenant_id`. O `tenant_id` efetivo vem exclusivamente do token, nunca de body, query ou parâmetro de rota.

- Listagens e mutações são sempre filtradas por `users.tenant_id = auth.tenant.id`.
- O login é a única consulta global por e-mail, necessária para localizar a clínica.
- Com e-mail duplicado entre clínicas, a seleção exige o slug da clínica.
- A trilha de auditoria também é segregada por clínica.

## RBAC

| Capacidade                    | Admin | Gerente | SDR |
| ----------------------------- | ----- | ------- | --- |
| Ver dashboard e configurações | Sim   | Sim     | Sim |
| Listar equipe                 | Sim   | Sim     | Não |
| Criar/editar usuários         | Sim   | Não     | Não |
| Editar dados da clínica       | Sim   | Não     | Não |

A restrição da SDR a resultados próprios será aplicada às entidades de leads e conversas nas próximas etapas. A fundação já entrega o papel e os guardas de autorização.

## Banco de dados

Tabelas da fundação:

- `tenants`: identidade, slug, fuso horário, horário comercial em JSONB e status.
- `users`: vínculo com a clínica, credenciais protegidas, papel, status e último login.
- `refresh_tokens`: hash do token, validade, revogação e metadados de sessão.
- `audit_logs`: ator, ação, entidade, metadados, IP e user-agent.

Migrations ficam em `apps/api/drizzle` e são geradas por Drizzle Kit. O ambiente de teste aplica as mesmas migrations em PGlite, garantindo que o SQL validado seja o mesmo usado em PostgreSQL.

Restrições relevantes:

- e-mail único por clínica (`tenant_id`, `email`);
- hash de refresh único;
- exclusão em cascata de tokens e auditoria quando a clínica é removida;
- `actor_user_id` da auditoria vira nulo se o usuário for removido.

## Tratamento de erros

Erros de domínio usam `AppError` com status HTTP, código e mensagem. O JSON segue o contrato:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos.",
    "details": [{ "field": "email", "message": "Informe um e-mail válido" }],
    "requestId": "req-1"
  }
}
```

Erros inesperados são registrados com o `requestId` e retornam mensagem genérica.

## Segurança

- Argon2id com memória de 19 MiB, 2 iterações e paralelismo 1.
- JWT HS256 com segredo de no mínimo 32 caracteres.
- Cookies HttpOnly, SameSite Lax; Secure obrigatório em HTTPS.
- Validação de `Origin` em métodos mutantes.
- CORS restrito à origem do painel.
- Helmet, rate limit global e limite específico no login/troca de senha.
- Logs com redação de cookies, autorização, senha e tokens.
- Nenhuma senha ou token retornado pela API.

## Confiabilidade e evolução

- Redis já está no Compose e no health check, mas o motor de cadências entra na Etapa 5.
- O health check retorna 503 se o banco estiver indisponível; Redis indisponível gera estado degradado controlado.
- Migrations são executadas de forma idempotente no start da API.
- As próximas etapas devem manter tarefas e webhooks idempotentes, com chave única persistida.
- O schema será ampliado com leads, conversas, qualificações, cadências, agendamentos e notificações, sempre com `tenant_id`.

## Decisões técnicas

- **Drizzle em vez de Prisma:** runtime mais simples e testes de integração com PGlite reutilizando as migrations reais.
- **Fastify:** baixo overhead para webhooks e APIs modulares por domínio.
- **Cookies + proxy do Next:** evita expor tokens ao JavaScript e elimina CORS no navegador.
- **Refresh opaco não rotativo:** escolha conservadora para o MVP; a rotação com detecção de reuso pode ser adicionada sem alterar o contrato externo.
- **Sem integração com UNO:** conforme adendo v1.1. O modelo de agendamento será preparado na Etapa 4.
- **Sem dados clínicos ou CPF na fundação:** coleta acontece apenas nas etapas e fluxos previstos, com finalidade e acesso restrito.
