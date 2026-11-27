# Runbook do piloto

Guia para operar o piloto com **uma clínica e um número oficial da Meta**. Este documento não
contém tokens nem credenciais.

## Pré-requisitos

- Número de telefone oficial registrado no WhatsApp Manager (não o número de teste).
- App da Meta em modo live, com permissões `whatsapp_business_messaging`,
  `whatsapp_business_management` e `business_management`.
- Token permanente de usuário de sistema, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID` e
  `WHATSAPP_WABA_ID`.
- Domínio com HTTPS, VPS com Docker/Compose e backup externo já testado (ver `docs/deploy.md`).
- Texto de transparência e registro de consentimento validados pela clínica.

## Configuração de go-live

No `.env` da VPS:

```dotenv
NODE_ENV=production
SEED_DEMO_USERS=false
NEXT_PUBLIC_SHOW_DEMO_HINTS=false
COOKIE_SECURE=true
WEB_ORIGIN=https://crm.seudominio.com.br
WHATSAPP_MODE=live
AI_MODE=fallback
CADENCE_WORKER_ENABLED=true
BACKUP_STATUS_FILE=/app/backups/last-backup.json
BACKUP_STALE_HOURS=26
```

- `WHATSAPP_ACCESS_TOKEN` deve ser o token permanente do usuário de sistema; nunca versioná-lo.
- `AI_MODE=fallback` evita depender da OpenAI durante o piloto; mude para `llm` apenas com
  `AI_API_KEY` válida e limite diário definido.
- O seed não deve criar usuários demo em produção. A senha do administrador é definida por
  `SEED_ADMIN_PASSWORD` e deve ser trocada no primeiro acesso.

## Subida e verificação

```bash
docker compose up -d --build
docker compose exec api node apps/api/dist/db/seed.js
docker compose ps
curl -fsS https://crm.seudominio.com.br/healthz
```

Checklist de validação:

1. `GET /health`: `checks.database=ok`, `backup.stale=false` e backlog sem tarefas travadas.
2. Meta → WhatsApp → Webhook: callback `https://crm.seudominio.com.br/webhooks/whatsapp`,
   verify token do `.env` e campo `messages` marcado.
3. Enviar mensagem real para o número oficial: lead e conversa criados, resposta inicial enviada
   uma única vez e evento registrado em `webhook_events`.
4. Repetir o mesmo evento: `webhook_events` não duplica e `ai_insights` permanece íntegro.
5. No detalhe do lead, conferir insight com `classification`, `summary`, `requiresSdr` e
   `silent=true` após a SDR assumir.
6. Em `/cadencias`, usar a fila de elegíveis → prévia → confirmação; conferir auditoria
   `cadence.enrolled` e status `in_cadence`.
7. Opt-out: enviar mensagem de opt-out e confirmar que novos envios são bloqueados e a cadência é
   cancelada.

## Indicadores do piloto

`GET /v1/reports/pilot` (e o cartão **Piloto** em `/relatorios`) apresenta:

- tempo médio de primeira resposta;
- taxa de qualificação dos leads;
- agendamentos registrados;
- taxa de resposta às cadências;
- opt-outs e falhas de envio.

Compare os números com a operação manual da clínica antes de definir metas. Acompanhe diariamente
`backup.stale`, mensagens com `status=failed` e notificações internas sem leitura.

## Rotina diária

- Verificar `GET /health` e o monitor externo de uptime.
- Conferir o log do cron de backup e `backup.lastRunAt`.
- Revisar leads em **Aguardando SDR** e insights que exigem atendimento humano.
- Confirmar que nenhuma cadência envia fora do horário comercial e que opt-outs estão bloqueados.

## Rollback

1. Manter a tag da versão anterior do container e o dump mais recente.
2. Se necessário, restaurar com `scripts/restore-postgres.sh` em ambiente separado antes de
   reaplicar em produção.
3. Voltar ao deploy anterior com `docker compose up -d --build` usando a tag antiga.
4. Em caso de problema com a Meta, alternar `WHATSAPP_MODE=dry-run` e reiniciar a API.

## LGPD

Consentimento não é implícito ao enviar mensagem. Registre evidência e versão do texto, aplique
opt-out imediatamente e defina com a clínica o prazo de retenção do histórico de conversas antes do
go-live.
