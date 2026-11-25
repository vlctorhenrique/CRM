# Arquitetura — Etapas 1 e 2

## Visão geral

```
Navegador                      Meta WhatsApp Cloud API
   |                                     |
   | HTTPS                               | HTTPS (webhook assinado)
   v                                     v
Nginx (TLS no host ou container) — /webhooks/whatsapp
   |                                     |
   v                                     v
Next.js (painel + proxy /api/backend)  Fastify API
                                         |           \
                                         v            v
                                   PostgreSQL      Redis (reservado)
```

O navegador nunca acessa a API diretamente. O Next.js encaminha chamadas de `/api/backend/*` para a API, preservando cookies de primeira parte. O webhook da Meta é a exceção: o Nginx encaminha `/webhooks/whatsapp` direto para a API, pois a chamada não usa cookie nem sessão. Em produção, a API e o Redis não publicam portas; somente o Nginx é exposto.

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

| Capacidade                    | Admin | Gerente | SDR                |
| ----------------------------- | ----- | ------- | ------------------ |
| Ver dashboard e configurações | Sim   | Sim     | Sim                |
| Listar equipe                 | Sim   | Sim     | Não                |
| Criar/editar usuários         | Sim   | Não     | Não                |
| Editar dados da clínica       | Sim   | Não     | Não                |
| Ver leads                     | Todos | Todos   | Apenas os próprios |
| Criar e editar leads          | Sim   | Sim     | Apenas os próprios |
| Atribuir responsável          | Sim   | Sim     | Não                |
| Enviar mensagem manual        | Sim   | Sim     | Apenas os próprios |
| Configurar WhatsApp           | Sim   | Não     | Não                |

A restrição da SDR é aplicada no serviço de leads: listagem, detalhe, leitura e envio consultam o responsável antes de retornar dados. Tentativas de acessar lead de outra SDR retornam 404 para não revelar a existência do registro.

## Banco de dados

Tabelas da fundação:

- `tenants`: identidade, slug, fuso horário, horário comercial em JSONB e status.
- `users`: vínculo com a clínica, credenciais protegidas, papel, status e último login.
- `refresh_tokens`: hash do token, validade, revogação e metadados de sessão.
- `audit_logs`: ator, ação, entidade, metadados, IP e user-agent.

Tabelas da Etapa 2:

- `whatsapp_accounts`: número da clínica, `phone_number_id` único, status da conexão, mensagem inicial e preferência de IA.
- `leads`: telefone normalizado único por clínica, origem, status, responsável, qualificação, consentimento e opt-out.
- `conversations`: vínculo lead + conta WhatsApp, não lidas, prévia da última mensagem, janela de atendimento e takeover humano.
- `messages`: direção, tipo, status, `provider_message_id` único, corpo, autor e timestamps.
- `webhook_events`: chave de idempotência, payload, status de processamento e erro.

Migrations ficam em `apps/api/drizzle` e são geradas por Drizzle Kit. O ambiente de teste aplica as mesmas migrations em PGlite, garantindo que o SQL validado seja o mesmo usado em PostgreSQL.

Restrições relevantes:

- e-mail único por clínica (`tenant_id`, `email`);
- hash de refresh único;
- exclusão em cascata de tokens e auditoria quando a clínica é removida;
- `actor_user_id` da auditoria vira nulo se o usuário for removido.

## Webhook do WhatsApp

1. `GET /webhooks/whatsapp` responde o desafio da Meta quando `hub.verify_token` confere com `WHATSAPP_VERIFY_TOKEN`.
2. `POST /webhooks/whatsapp` usa o corpo bruto para validar `X-Hub-Signature-256` com HMAC-SHA256 e `WHATSAPP_APP_SECRET`.
3. O `phone_number_id` do evento localiza a conta e a clínica. Número desconhecido é registrado como ignorado, sem criar dados órfãos.
4. Cada evento é reivindicado em `webhook_events` com chave única:
   - mensagem: `message:<wamid>`;
   - status: `status:<wamid>:<status>:<timestamp>`.
5. Mensagem nova faz upsert do lead pelo telefone normalizado, cria ou atualiza a conversa e armazena a mensagem.
6. O primeiro atendimento automático é enviado apenas uma vez, controlado por `leads.initial_message_sent_at`; em `dry-run` o envio é registrado sem chamar a Meta.
7. Texto de opt-out marca o lead como `opt_out`, revoga o consentimento e bloqueia novos envios.
8. Status `sent`, `delivered`, `read` e `failed` atualizam a mensagem sem regredir estados mais avançados.

Toda falha de processamento marca o evento como `failed` e pode ser reprocessada em um novo recebimento. As credenciais da Meta ficam exclusivamente em variáveis de ambiente.

## Janela de 24 horas

O envio manual só é permitido quando existe mensagem recebida nas últimas 24 horas. Fora da janela, a API retorna `OUTSIDE_SERVICE_WINDOW` com HTTP 422. Templates aprovados e o fluxo de retomada entram na Etapa 5.

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
- Webhook exige assinatura HMAC no modo live; comparação em tempo constante.
- Telefone é normalizado em E.164 e o telefone bruto é preservado apenas para exibição/auditoria.

## Confiabilidade e evolução

- Redis já está no Compose e no health check, mas o motor de cadências entra na Etapa 5.
- O health check retorna 503 se o banco estiver indisponível; Redis indisponível gera estado degradado controlado.
- Migrations são executadas de forma idempotente no start da API.
- Webhooks e envios automáticos são idempotentes por chave persistida.
- O schema será ampliado com qualificações estruturadas, cadências, agendamentos e notificações, sempre com `tenant_id`.
- O modo `dry-run` permite validar o fluxo completo sem chamar a Meta e sem gerar custo.

## Decisões técnicas

- **Drizzle em vez de Prisma:** runtime mais simples e testes de integração com PGlite reutilizando as migrations reais.
- **Fastify:** baixo overhead para webhooks e APIs modulares por domínio.
- **Cookies + proxy do Next:** evita expor tokens ao JavaScript e elimina CORS no navegador.
- **Refresh opaco não rotativo:** escolha conservadora para o MVP; a rotação com detecção de reuso pode ser adicionada sem alterar o contrato externo.
- **Sem integração com UNO:** conforme adendo v1.1. O modelo de agendamento será preparado na Etapa 4.
- **WhatsApp oficial em vez de scraping:** a Cloud API mantém o número dentro das políticas da Meta e permite webhook confiável.
- **Credenciais fora do banco:** tokens da Meta são lidos do ambiente; o banco guarda apenas a configuração operacional da conta.
- **Primeiro atendimento único:** evita mensagens duplicadas em reenvios e mantém o histórico coerente.
- **Opt-out como estado do lead:** bloqueia envios em qualquer fluxo, inclusive automações futuras.
- **Sem dados clínicos ou CPF na fundação:** coleta acontece apenas nas etapas e fluxos previstos, com finalidade e acesso restrito.
