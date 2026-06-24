# Bora Cuidar Web

Frontend publico do marketplace Bora Cuidar, responsavel por descoberta de negocios, selecao de servicos e fluxo de agendamento.

## Stack

- React + Vite
- React Router
- Firebase Web SDK
- Cloud Run para criacao/validacao server-side de agendamentos

## Estrutura principal

- `src/`: frontend web
- `backend/booking-api`: backend Node/Express para agendamento em Cloud Run
- `deploy/workflow-hostgator`: script de build + deploy FTPS do frontend
- `docs/`: documentacao operacional e de negocio

## Frontend

Instalacao:

```bash
npm install
```

Ambiente de producao:

1. copie `.env.production.example` para `.env.production`
2. preencha as variaveis necessarias

Exemplo:

```env
VITE_BOOKING_API_URL=https://boracuidar-booking-api-xxxxxx-uc.a.run.app
VITE_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Observacao importante:

- se `VITE_BOOKING_API_URL` estiver definida, o frontend usa o backend server-side para criar e validar agendamentos;
- se nao estiver definida, o frontend usa o fluxo legado client-side como fallback.
- se `VITE_PUBLIC_POSTHOG_KEY` estiver definida, o frontend ativa analytics e session replay com PostHog.

Build:

```bash
npm run build
```

## Backend de agendamento

O backend foi criado em `backend/booking-api` para mover do cliente para o servidor:

- validacao de limite de agendamentos
- validacao de disponibilidade
- criacao atomica com locks de horario
- notificacoes internas
- webhook de automacao

Documentacao detalhada:

- [docs/BOOKING_BACKEND.md](docs/BOOKING_BACKEND.md)

Instalacao local:

```bash
cd backend/booking-api
npm install
```

Execucao local:

```bash
npm run dev
```

Healthcheck:

```bash
GET /health
```

Endpoint principal:

```bash
POST /api/bookings/create
```

## Deploy do frontend

O deploy atual usa FTPS via HostGator.

Credenciais:

- `deploy/workflow-hostgator/secrets.env`

Publicacao:

```bash
python .\deploy\workflow-hostgator\deploy_web_hostgator.py
```

O script:

- instala dependencias
- gera o build
- cria `.htaccess` para SPA
- sobe `dist/` via FTPS

## Mudancas importantes recentes

- fluxo de confirmacao mais rapido com menos bloqueio no frontend
- instrumentacao de performance para casos lentos
- cache curto na pagina de servicos
- criacao e validacao de agendamento movidas para backend quando `VITE_BOOKING_API_URL` estiver ativa
- integracao opcional com PostHog para analytics de produto e session replay

## Arquivos locais que nao devem ser commitados

- `.env.production`
- `.ftp-deploy-sync-state-web.json`

Use `.env.production.example` como base segura para configuracao.
