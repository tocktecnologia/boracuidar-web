# BUSINESS CONTEXT - BORA CUIDAR WEB (MARKETPLACE REACT)

> Documento de referencia funcional e tecnica do projeto `boracuidar-web`.
> Baseado no estado atual do codigo em 2026-05-30.

## 1) Visao geral do produto

O `boracuidar-web` e o frontend publico do marketplace.
Ele atende o cliente final para descoberta, reserva e acompanhamento de agendamentos.

Jornada principal do usuario final:

- descobrir negocios e servicos,
- escolher profissional e horario,
- concluir agendamento,
- consultar e cancelar agendamentos,
- avaliar atendimento.

Este projeto nao e o backoffice operacional; ele e o canal de aquisicao/conversao.

## 2) Objetivo de negocio

Transformar trafego publico em agendamentos validos para os negocios da plataforma, com UX simples e rapida.

## 3) Stack e arquitetura

Stack principal:

- React + Vite,
- React Router,
- Firebase Web SDK,
- componentes CSS locais por pagina/modulo.

Arquivos base:

- `src/main.jsx`: bootstrap React.
- `src/App.jsx`: roteamento principal.
- `src/lib/firebase.js`: configuracao Firebase (`agenda-tock`).
- `src/lib/firestore.js`: camada de dados e regras utilitarias.
- `src/lib/marketplace.js`: helpers de dominio (formatacao/parsing).

## 4) Rotas e organizacao de telas

Rotas identificadas:

- `/marketplace`
- `/marketplace/business`
- `/marketplace/business/services`
- `/marketplace/business/services/:serviceId`
- `/marketplace/business/reviews`
- `/marketplace/meus-agendamentos`
- `/marketplace/confirmation`

Componente de layout:

- `MarketplaceLayout` organiza navegacao e CTA para `business.boracuidar.app`.

## 5) Orquestracao e chamadas

### 5.1 Camada Firestore

`src/lib/firestore.js` centraliza:

- wrappers de consulta,
- uso de `collectionGroup` com fallbacks,
- regras de plano e limites,
- verificacao de integracoes n8n por plano,
- insercao/atualizacao de registros transacionais.

### 5.2 Camada de dominio marketplace

`src/lib/marketplace.js` oferece:

- normalizacao de dados de pagina,
- helpers de datas e horarios,
- escolha de capa/imagens,
- labels por tipo de negocio.

### 5.3 Camada de paginas e componentes

As paginas montam o estado de tela e delegam regras transacionais para componentes de fluxo, com destaque para `BookingDialog`.

## 6) Regras de negocio criticas

### 6.1 Exibicao no marketplace

Negocio e exibido quando pagina publica esta liberada (`allow_page=true`), com fallback de fonte quando necessario.

### 6.2 Motor de agendamento

`BookingDialog` implementa:

- selecao de um ou mais servicos,
- compatibilidade profissional-servico,
- calculo de slots disponiveis,
- bloqueio de conflitos com agenda existente,
- validacao de capacidade por plano,
- gravacao de um `agendamentos` por servico selecionado.

### 6.3 Disponibilidade

Disponibilidade e calculada a partir de:

- `horarios_padrao`,
- `horarios_excecoes`,
- intervalos/bloqueios,
- ocupacao real em `agendamentos`.

### 6.4 Notificacoes e automacoes

Apos reservar/cancelar:

- cria notificacoes internas em `notifications`,
- dispara webhook n8n (quando plano permite).

### 6.5 Meus agendamentos por telefone

Consulta depende de verificacao por codigo enviado via webhook n8n.
Validacao do codigo acontece no estado da sessao web.

### 6.6 Avaliacoes

Usuario final pode avaliar atendimento; frontend aciona atualizacao de medias/resumos.

## 7) Modelo de dados Firestore usado pelo web

Colecoes principais:

- `business`
- `servicos`
- `trabalhadores`
- `trabalhador_servico`
- `agendamentos`
- `horarios_padrao`
- `horarios_excecoes`
- `notifications`
- `subscriptions`
- `page` / `business-page`
- avaliacoes (colecao de reputacao)

## 8) Comportamento por pagina

- `MarketplacePage`: catalogo, filtros e destaques de negocios.
- `MarketplaceBusinessPage`: detalhe completo do negocio e entrada de reserva.
- `MarketplaceBusinessServicesPage`: listagem de servicos por negocio.
- `MarketplaceServiceBookingPage`: reserva orientada por servico.
- `MarketplaceBusinessReviewsPage`: listagem e envio de avaliacao.
- `MarketplaceMySchedulesPage`: busca por telefone, agenda futura e cancelamento.
- `MarketplaceConfirmationPage`: comprovacao de agendamento.

## 9) Infraestrutura e deploy

No estado atual:

- build local com Vite,
- script de deploy FTPS em `deploy/workflow-hostgator/deploy_web_hostgator.py`,
- geracao de `.htaccess`, sync remoto e limpeza de artefatos antigos.

Nao foi identificado workflow de GitHub Actions ativo neste repositorio para deploy automatico.

## 10) Riscos e pontos de atencao

- regra de negocio sensivel executada no cliente (precisa reforco server-side em cenarios criticos),
- dependencia de n8n para automacoes de comunicacao,
- uso de fallbacks de fonte de pagina publica aumenta complexidade de consistencia.

## 11) Checklist para futuras alteracoes

Validar sempre:

1. fluxo completo listagem -> detalhe -> reserva -> confirmacao,
2. consistencia de disponibilidade e conflitos de agenda,
3. limites de plano antes de persistir reserva,
4. side effects de cancelamento (notificacao + webhook),
5. robustez de rotas publicas e deep links.

---

## Resumo de posicionamento no ecossistema

- `boracuidar-web`: camada publica de aquisicao e autoatendimento.
- `boracuidar` (Flutter): operacao interna do negocio.

Ambos compartilham backend Firebase e regras correlatas de agenda, plano e publicacao.
