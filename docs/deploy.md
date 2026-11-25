# Deploy em VPS

Guia para Ubuntu Server LTS em VPS (referência inicial: Hostinger, 2 vCPU e 8 GB RAM).

## 1. Preparação da VPS

1. Crie a VPS com Ubuntu Server LTS e acesso SSH por chave.
2. Aponte o DNS do domínio para o IP da VPS.
3. Acesse como usuário com sudo e atualize o sistema:

```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone America/Sao_Paulo
```

4. Configure o firewall liberando apenas SSH, HTTP e HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 2. Docker

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Saia e entre novamente no SSH para aplicar o grupo.

## 3. Aplicação

```bash
git clone <url-do-repositorio> crm
cd crm
cp .env.example .env
```

Edite o `.env` com valores de produção:

```dotenv
NODE_ENV=production
POSTGRES_PASSWORD=<senha-forte-e-compativel-com-url>
JWT_SECRET=<48-bytes-aleatorios>
SEED_ADMIN_PASSWORD=<senha-forte-do-admin>
SEED_DEMO_USERS=false
NEXT_PUBLIC_SHOW_DEMO_HINTS=false
COOKIE_SECURE=true
WEB_ORIGIN=https://crm.seudominio.com.br
HTTP_PORT=127.0.0.1:8080
ENABLE_API_DOCS=false

WHATSAPP_MODE=live
WHATSAPP_VERIFY_TOKEN=<token-aleatorio-do-webhook>
WHATSAPP_APP_SECRET=<app-secret-do-app-meta>
WHATSAPP_ACCESS_TOKEN=<access-token-valido>
WHATSAPP_PHONE_NUMBER_ID=<phone-number-id>
WHATSAPP_WABA_ID=<waba-id>
WHATSAPP_API_VERSION=v23.0
WHATSAPP_PHONE_NUMBER=+55 11 90000-0000
WHATSAPP_INITIAL_MESSAGE=Olá! Que bom ter você aqui. Para eu te ajudar melhor, qual procedimento ou tratamento despertou seu interesse?
```

Gere o segredo JWT com:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Evite `@`, `:`, `/`, `#` e `%` na senha do PostgreSQL, pois ela compõe a `DATABASE_URL` do Compose.

Suba os containers:

```bash
docker compose up -d --build
docker compose ps
```

As migrations são aplicadas automaticamente no start da API. Em seguida, crie a clínica e o administrador:

```bash
docker compose exec api node apps/api/dist/db/seed.js
```

Confirme o health check:

```bash
curl -i http://127.0.0.1:8080/healthz
docker compose exec api node -e "fetch('http://127.0.0.1:3333/health').then(async r=>{console.log(r.status, await r.text())})"
```

### Configuração do WhatsApp

O container do Nginx encaminha `POST/GET /webhooks/whatsapp` diretamente para a API. No painel da
Meta, configure o webhook com:

- Callback URL: `https://crm.seudominio.com.br/webhooks/whatsapp`
- Verify token: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
- Campo assinado: `messages`

O `WHATSAPP_APP_SECRET` valida a assinatura de cada evento. Com `WHATSAPP_MODE=live`, a API não
inicia se verify token, app secret, access token ou phone number ID estiverem ausentes. O seed cria
a conta da clínica usando `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_PHONE_NUMBER`; o administrador pode
ajustar número exibido e mensagem inicial em **Configurações**.

Valide com uma mensagem real para o número oficial:

```bash
docker compose logs -f api
curl -s https://crm.seudominio.com.br/healthz
```

A mensagem deve criar o lead, a conversa e o primeiro atendimento automático (uma única vez). Se o
webhook falhar, confira a assinatura, o phone number ID e o status do evento em `webhook_events`.

Em desenvolvimento, use `WHATSAPP_MODE=dry-run` para validar sem enviar mensagens reais.

## 4. HTTPS no host

A porta 8080 fica restrita a `127.0.0.1`. O TLS é terminado pelo Nginx do host.

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Crie o site inicial em HTTP para o desafio do Certbot:

```nginx
server {
    listen 80;
    server_name crm.seudominio.com.br;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ative o site, valide e recarregue:

```bash
sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/crm
sudo nginx -t
sudo systemctl reload nginx
```

Emita o certificado:

```bash
sudo certbot --nginx -d crm.seudominio.com.br
```

Depois substitua a configuração pelo modelo endurecido em `nginx/host-https.example.conf`, ajustando domínio e caminhos do certificado. Valide e recarregue novamente:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I https://crm.seudominio.com.br
```

O `COOKIE_SECURE=true` só funciona corretamente após o HTTPS estar ativo.

## 5. Backup

O backup precisa sair da VPS. Instale o `rclone`, configure um remoto externo e teste a cópia.

```bash
sudo apt install -y rclone
rclone config
chmod +x scripts/backup-postgres.sh scripts/restore-postgres.sh
RCLONE_REMOTE=seu-remoto:crm-backups RETENTION_DAYS=14 ./scripts/backup-postgres.sh
```

Agende no cron do usuário:

```cron
15 3 * * * cd /home/<usuario>/crm && RCLONE_REMOTE=seu-remoto:crm-backups RETENTION_DAYS=14 ./scripts/backup-postgres.sh >> /var/log/crm-backup.log 2>&1
```

Teste a restauração periodicamente em um ambiente separado:

```bash
./scripts/restore-postgres.sh backups/crm-AAAAMMDDTHHMMSSZ.dump
```

Backup na mesma VPS não atende ao requisito de recuperação. Defina retenção externa e monitore as falhas do cron.

## 6. Operação

Comandos úteis:

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f web
docker compose logs -f nginx
docker compose restart api
docker compose exec postgres pg_isready
```

Atualização:

```bash
git pull
docker compose build
docker compose up -d
docker compose ps
```

As migrations são aplicadas no start da API. Faça backup antes de atualizações que incluam migrations destrutivas e mantenha uma tag da versão anterior para rollback.

## 7. Monitoramento mínimo

- Monitor externo de uptime em `https://crm.seudominio.com.br/healthz`.
- Alerta para `docker compose ps` com containers `unhealthy`.
- Alerta para falha do backup diário.
- Retenção de logs do Docker configurada no daemon.
- Revisão periódica de acessos e usuários desativados.

## 8. Checklist de segurança

- [ ] `JWT_SECRET` aleatório e exclusivo.
- [ ] `POSTGRES_PASSWORD` forte.
- [ ] Senha do admin trocada após o primeiro acesso.
- [ ] `SEED_DEMO_USERS=false` e `NEXT_PUBLIC_SHOW_DEMO_HINTS=false`.
- [ ] HTTPS ativo e `COOKIE_SECURE=true`.
- [ ] `WEB_ORIGIN` igual ao domínio final com HTTPS.
- [ ] Webhook da Meta apontando para `https://<domínio>/webhooks/whatsapp`.
- [ ] `WHATSAPP_MODE=live` somente com credenciais completas e testadas.
- [ ] App secret e access token fora do Git e com rotação planejada.
- [ ] Portas do PostgreSQL, Redis e API não expostas publicamente.
- [ ] Firewall liberando apenas 22, 80 e 443.
- [ ] Backup externo diário com teste de restauração.
- [ ] Documentação de retenção e privacidade validada pela clínica.
- [ ] Atualizações de segurança do sistema e das imagens Docker agendadas.
