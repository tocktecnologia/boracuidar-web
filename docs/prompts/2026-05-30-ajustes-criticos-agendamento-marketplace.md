# 2026-05-30 - Ajustes Criticos de Agendamento Marketplace

## Contexto
- Projeto: `boracuidar-web`
- Data: 2026-05-30
- Objetivo: corrigir concorrencia de agendamento, fit de horario, UX de horarios ocupados, adicionar botao de meus agendamentos na pagina de servicos e criar pagina de detalhe/cancelamento por `agendamentoId`.

## Prompt Original (Usuario)
"""
Agora vc ja tem o contexto de cada um dos projetos mas vou apenas fazer uma lembrança. O boracuidar  é o app app do profissional , o boracuidar-web  é o app que os clientes usam para agendar  com os profissionais.

Preciso que se concentre em alguns ajustes:

1. Está acontecendo um erro crítico. Dois clientes estão conseguindo marcar no mesmo horario o mesmo serviço com o mesmo profissiona na mesma barbearia no mesmo dia.

Isso aconteceu com um profissional , muito provavelmente os dois cliente acessaram o site boracuidar-web e nas telas /marketplace/business ou /marketplace/business/services clicaram em agendar , preencheram os dados e clicaram praticamente no mesmo momento no botão de confirmar. Isso causou um estresse para meu profissional que precisou dar um jeito de atender pois os dois clientes chegaram la no mesmo horario.

Quero que encontre uma solução eficaz e faça os ajustes necesários para resover essa questão. Mesmo que os usuarios tenham clicado no botão no mesmo momento, um usuario chegou mais rapido no banco e seu agendamento foi feito, para o outro usuario que chegou depois , o sistema deveria entender que ja tem um agendamento para aquela barbearia, para aquele profissional, para aquele serviço , naquele dia e horario e avisar ao cliente que outra pessoa acabou de fazer a reserva mais rápido e deixar a opção de voltar para os serviços para escolher novo horario.
Resolve isso d euma forma eficaz e otimizada.


2. tb  Está ocorrendo um problema de fit de horário. O Profissional setou nos seus horarios (pagina /workerAvailability) que seu intervalo em determinado dia é de 12 as 14 , entretanto um cliente conseguiu marcar um serviço que dura 1 hora e 30 minutos bem no horario de 11h. Isso não deveria acontecer pois 1 hora e meia não cabe em um periodo de 11h pois não cabe no periodo de disponibilidade do profissional. Quero que revise isso e encontre o porque de isso esta acontecendo, ajuste o que precisar para isso não acontecer mais. 
Algumas vezes tb foi possível o cliente marcar mais de um serviço que no final somando a duração de cada um  daria mais de 1 hora de duração em um bloco que agnedamento que não caberia. Provavelmente esse problema pode ter relação com o problema relatado do caso 1 aqui desse prompt. por exemplo, pode ter acontecido que no momento que o cliente 1 abriu os dados para marcar tinha o bloco liberado de 10 as 12 então ele selecionou uns 3 serviços de  30 min e caberia nas 10h as 11:30
, porem antes de ele marcar outra pessoa pegou o horario e por tanto acabou tendo choque de horario. Quero que revise para ver se está tudo ok com isso. Caso precise testar marcando agendamentos pode usar o business_id : 0wtZRyuOy9Rwth6FjGXe  a vontad para testes.


3. No dialgo de agendamento que o cliente escolhe dia, horario serviço, quando todos os horarios ja foram preenchidos esta aparecendo uma mensagem "Nao ha horarios disponiveis nesse periodo." eu quero manter o horario porem com um indicativo de que aquele horario esta ocupado. Impedindo o usuario de selecionar o horario. Claro se algum usuario desmarcar um horario , aquele horario deve ser desocupado e habilitado para ser selecionado. 


4. Na pagina /marketplace/business/services eu quero que tenha um botão de "Meus agendamentos" que pode ficar no canto inferior esquerdo do bloco onde tem a logo e o nome do business. Quando clicado nisso deve direcionar para o whatsapp do bot com a mensagem /meus_agendamentos como ja é feito em algum local do codigo que chama o bot. 


5. Quero tb que crie uma pagina para ver um agendamento especifico, por exemplo: 
/marketplace/meus-agendamentos/<agendamentoId>?businessId=0wtZRyuOy9Rwth6FjGXe
Isso deve mostrar o card do agendamento com as informações e o botão de cancelar, quando usuario clicar em cancelar, não deve enviar codigo para  o whatsapp, deve apenas seguir realmente o fluxo de cancelar. 
Essa pagina não precisa esta em algum fluxo  de clique de botão ou outra coisa que leva ate ela pois vou usar o link dela direcionando diretamente. de outro local.  

6. Não quero mais que coloque os prompts em docs/prompts, ja apaguei esssa pasta.
coloque especificamente  esse prompt e todas a interações  que eu fizer nele  em um arquivo com a data e titulo do prompt  em /boracuidar-web/docs/prompts/.
"""

## Interacoes
### 2026-05-30T00:00-03:00 - Usuario
- Solicitou as 6 mudancas acima.

### 2026-05-30T00:00-03:00 - Assistente
- Analise e implementacao em andamento neste turno.
### 2026-05-30T00:00-03:00 - Assistente (conclusao do turno)
- Implementou blindagem de concorrencia no backend (`createSchedulesAtomically`) com validacao atomica por horario + confronto com agendamentos existentes do dia.
- Corrigiu validacao de fit de horario (expediente, intervalo e bloqueios) no momento da confirmacao do agendamento.
- Ajustou o dialog para exibir horarios ocupados desabilitados (com indicador "Ocupado") em vez de esconder horarios.
- Adicionou botao "Meus agendamentos" em `/marketplace/business/services` apontando para WhatsApp bot com `/meus_agendamentos`.
- Criou a rota/pagina `/marketplace/meus-agendamentos/:agendamentoId` com card de detalhes e cancelamento direto, sem fluxo de codigo via WhatsApp.
- Validacao executada com sucesso: `npm run lint` e `npm run build`.

### 2026-05-30T00:00-03:00 - Usuario (deploy)
- Solicitou deploy do `boracuidar-web` com pagina customizada de manutencao (com logo Bora Cuidar) durante o deploy e retorno automatico ao site ao finalizar.

### 2026-05-30T00:00-03:00 - Assistente (deploy)
- Adaptou o script local `deploy/workflow-hostgator/deploy_web_hostgator.py` para:
  - publicar pagina de manutencao automaticamente;
  - manter `index.html` de manutencao durante upload;
  - enviar logo Bora Cuidar para `/_maintenance_logo.png`;
  - subir `index.html` real apenas no fim (troca automatica para o site).
- Primeira tentativa de deploy falhou por timeout de conexao FTPS.
- Segunda tentativa com `--timeout 420 --skip-build --skip-install` concluiu com sucesso.
- Resultado do deploy:
  - diretorio remoto: `/`
  - removidos: `26`
  - enviados: `30`
