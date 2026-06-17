# Booking Backend

## Objetivo

Mover a validacao e a criacao do agendamento para backend, reduzindo:

- latencia percebida no celular,
- dependencia de multiplas consultas do navegador ao Firestore,
- risco de regras criticas rodarem apenas no cliente.

## Estrutura

O backend foi criado em:

- `backend/booking-api`

Arquivos principais:

- `backend/booking-api/src/index.js`
- `backend/booking-api/package.json`
- `backend/booking-api/Dockerfile`

## Endpoint

### `POST /api/bookings/create`

Payload esperado:

```json
{
  "businessId": "0wtZRyuOy9Rwth6FjGXe",
  "workerId": 123,
  "customerName": "Nome Cliente",
  "customerPhone": "5585999999999",
  "dateKey": "2026-06-17",
  "schedules": [
    {
      "serviceId": 456,
      "startTime": "09:00",
      "endTime": "09:30"
    }
  ]
}
```

Resposta de sucesso:

```json
{
  "ok": true,
  "createdIds": [123456789],
  "insertedSchedules": [],
  "confirmationPayload": {}
}
```

## Frontend

O frontend passa a preferir o backend quando a variavel abaixo estiver definida:

- `VITE_BOOKING_API_URL`

Exemplo:

```env
VITE_BOOKING_API_URL=https://boracuidar-booking-api-xxxxx-uc.a.run.app
```

Sem essa variavel, o frontend continua usando o fluxo antigo como fallback.

## Deploy no Cloud Run

Exemplo com `gcloud`:

```bash
cd backend/booking-api
gcloud run deploy boracuidar-booking-api ^
  --source . ^
  --region us-central1 ^
  --allow-unauthenticated
```

Observacoes:

- o servico usa `firebase-admin` com `applicationDefault()`;
- no Cloud Run, o service account precisa ter permissao de leitura/escrita no Firestore;
- se quiser reduzir latencia para o Brasil, vale escolher uma regiao mais proxima do publico.

## Permissoes recomendadas

No service account do Cloud Run:

- `Cloud Datastore User` ou permissao equivalente para Firestore

Se houver webhooks ou segredos adicionais no futuro:

- usar `Secret Manager`

## Roteiro de ativacao

1. subir o backend no Cloud Run;
2. testar `GET /health`;
3. configurar `VITE_BOOKING_API_URL` no build do frontend;
4. publicar o frontend;
5. validar o fluxo no celular;
6. acompanhar `web_perf_events` para comparar antes/depois.
