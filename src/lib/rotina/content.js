// Conteúdo do app: humor, desafios, trilhas, artigos e campanhas.
// Textos de exemplo. Antes do lançamento, cada conteúdo de saúde passa por revisão de um profissional com registro.

export const MOODS = [
  { score: 1, label: "Muito mal" },
  { score: 2, label: "Mal" },
  { score: 3, label: "Ok" },
  { score: 4, label: "Bem" },
  { score: 5, label: "Muito bem" },
];

export const HELP_CONTACTS = [
  { label: "CVV, apoio emocional 24 horas", number: "188" },
  { label: "SAMU, emergência médica", number: "192" },
];

export const CHALLENGES = [
  { id: "agua7", label: "7 dias de água", description: "Bater a meta de água por 7 dias.", days: 7, habits: ["agua"], dim: "alimentacao" },
  { id: "respira7", label: "7 dias de respiração", description: "Cinco minutos de respiração calma por 7 dias.", days: 7, habits: ["respiracao"], dim: "mente" },
  { id: "semtela14", label: "14 noites sem tela", description: "Desligar as telas antes de dormir por 14 noites.", days: 14, habits: ["desacelerar"], dim: "sono" },
  { id: "sono21", label: "21 noites de sono", description: "Dormir 7 horas ou mais em 21 noites.", days: 21, habits: ["sono7"], dim: "sono" },
  { id: "mov30", label: "30 dias de movimento", description: "Treinar, caminhar ou alongar em 30 dias.", days: 30, habits: ["treino", "caminhada", "alongamento"], dim: "movimento" },
];

export const TRAILS = [
  {
    slug: "dormir-melhor",
    title: "Dormir melhor em 7 noites",
    dim: "sono",
    summary: "Pequenos ajustes de rotina que costumam deixar a noite mais tranquila.",
    steps: [
      "Escolha um horário pra acordar e mantenha nos 7 dias, inclusive no fim de semana.",
      "Deixe o celular carregando longe da cama.",
      "Evite café e energético depois das 16h.",
      "Deixe o quarto escuro e fresco na hora de dormir.",
      "Desligue as telas 30 minutos antes de deitar.",
      "Se não pegar no sono em 20 minutos, levante e faça algo calmo até dar sono.",
      "No fim da semana, compare como você acordou nos primeiros e nos últimos dias.",
    ],
  },
  {
    slug: "voltar-a-treinar",
    title: "Voltar a se mexer em 4 semanas",
    dim: "movimento",
    summary: "Um recomeço leve, pra criar o hábito antes de pensar em intensidade.",
    steps: [
      "Semana 1: caminhe 15 minutos em 3 dias.",
      "Semana 1: escolha os dias e horários e coloque na agenda.",
      "Semana 2: suba pra 20 minutos e inclua 5 minutos de alongamento.",
      "Semana 3: troque uma caminhada por um treino que você goste.",
      "Semana 4: mantenha 3 vezes na semana e veja o que ficou mais fácil.",
      "Se tiver alguma condição de saúde, converse com um profissional antes de aumentar a intensidade.",
    ],
    cta: { label: "Encontrar personal ou academia", category: "Personal" },
  },
  {
    slug: "primeira-terapia",
    title: "Primeira vez na terapia",
    dim: "mente",
    summary: "O que esperar, como escolher e como se preparar pra primeira sessão.",
    steps: [
      "Leia o guia sobre a diferença entre psicólogo e psiquiatra.",
      "Pense no que te fez procurar terapia. Não precisa ter uma resposta pronta.",
      "Escolha entre atendimento presencial ou online.",
      "Na primeira sessão, pode perguntar sobre a abordagem, a frequência e o valor.",
      "Dê pelo menos três sessões antes de decidir se a combinação com o profissional funciona.",
    ],
    cta: { label: "Ver psicólogos", category: "Clínica" },
  },
  {
    slug: "sorriso-em-dia",
    title: "Sorriso em dia",
    dim: "saude",
    summary: "Uma rotina simples pra cuidar dos dentes entre uma consulta e outra.",
    steps: [
      "Confira quando foi sua última revisão no dentista.",
      "Troque a escova se ela tiver mais de três meses.",
      "Passe fio dental todos os dias desta semana.",
      "Marque a revisão se já passou de seis meses.",
      "Depois da consulta, registre aqui pra a gente lembrar da próxima.",
    ],
    cta: { label: "Agendar dentista", category: "Clínica" },
  },
  {
    slug: "tempo-pra-voce",
    title: "Mais tempo pra você",
    dim: "tempo",
    summary: "Encontrar espaço na semana pro que te faz bem, sem culpa.",
    steps: [
      "Anote três coisas que te fazem bem e que você deixou de fazer.",
      "Reserve 30 minutos na agenda desta semana pra uma delas.",
      "Faça uma pausa de 5 minutos sem celular todo dia.",
      "Diga não pra um compromisso que não é prioridade.",
      "No domingo, olhe pra semana e repita o que funcionou.",
    ],
    cta: { label: "Marcar uma massagem", category: "Estética" },
  },
];

export const ARTICLES = [
  {
    slug: "dentista-6-meses",
    kind: "Guia",
    title: "Por que a revisão no dentista costuma ser a cada seis meses",
    dim: "saude",
    minutes: 3,
    body: [
      "A revisão periódica serve pra encontrar cedo o que ainda é simples de tratar, como uma cárie pequena ou o começo de uma inflamação na gengiva.",
      "Seis meses é o intervalo mais comum pra quem não tem nenhum problema ativo. Quem usa aparelho, tem gengiva sensível ou histórico de cáries pode precisar voltar antes.",
      "Na consulta, o dentista avalia dentes e gengiva, faz a limpeza e indica o próximo retorno. Esse intervalo é o que vale pra você.",
      "Entre uma consulta e outra, escova, fio dental e troca da escova a cada três meses fazem a maior parte do trabalho.",
    ],
  },
  {
    slug: "psicologo-ou-psiquiatra",
    kind: "Guia",
    title: "Psicólogo ou psiquiatra: qual a diferença?",
    dim: "mente",
    minutes: 4,
    body: [
      "O psicólogo é formado em Psicologia e trabalha com conversa, em sessões de psicoterapia. Ele ajuda a entender pensamentos, emoções e comportamentos e a construir formas de lidar com eles.",
      "O psiquiatra é médico. Ele diagnostica e trata transtornos mentais e pode receitar medicamentos quando necessário.",
      "Muita gente faz acompanhamento com os dois ao mesmo tempo. Um não substitui o outro.",
      "Se você não sabe por onde começar, a terapia com um psicólogo costuma ser um bom primeiro passo. Se for preciso, o próprio psicólogo indica uma avaliação psiquiátrica.",
      "Se estiver passando por um momento muito difícil, o CVV atende 24 horas pelo 188, de graça.",
    ],
  },
  {
    slug: "agua-dois-litros",
    kind: "Mito ou verdade",
    title: "Todo mundo precisa beber exatamente 2 litros de água por dia?",
    dim: "alimentacao",
    minutes: 2,
    verdict: "Mito",
    body: [
      "A necessidade de água varia com o peso, o calor, a atividade física e até com o que você come. Frutas, verduras e sopas também hidratam.",
      "Os 2 litros funcionam como uma referência fácil de lembrar, não como regra pra todo mundo.",
      "Um sinal prático é a cor da urina: clara costuma indicar boa hidratação.",
      "Quem tem alguma condição de saúde que envolve rins ou coração deve seguir a orientação do seu médico.",
    ],
  },
  {
    slug: "sono-fim-de-semana",
    kind: "Mito ou verdade",
    title: "Dá pra recuperar o sono perdido no fim de semana?",
    dim: "sono",
    minutes: 2,
    verdict: "Em parte",
    body: [
      "Dormir mais no fim de semana alivia o cansaço, mas não desfaz por completo uma semana inteira dormindo pouco.",
      "Além disso, acordar muito mais tarde no sábado e no domingo bagunça o relógio do corpo e deixa a segunda-feira mais difícil.",
      "O que mais ajuda é manter um horário parecido todos os dias, com uma variação pequena no fim de semana.",
    ],
  },
  {
    slug: "checkup-preparar",
    kind: "Guia",
    title: "Checkup anual: como se preparar pra consulta",
    dim: "saude",
    minutes: 3,
    body: [
      "Leve seus últimos exames, mesmo que antigos. Eles ajudam o médico a comparar.",
      "Anote antes o que você quer perguntar e qualquer sintoma, mesmo que pareça pequeno.",
      "Tenha em mãos a lista de remédios e suplementos que você usa.",
      "Os exames pedidos variam com a idade, o histórico da família e o seu estilo de vida. Quem define é o médico.",
      "Depois da consulta, registre aqui pra a gente lembrar do próximo.",
    ],
  },
  {
    slug: "treino-curto",
    kind: "Mito ou verdade",
    title: "Treino curto não adianta nada?",
    dim: "movimento",
    minutes: 2,
    verdict: "Mito",
    body: [
      "Para quem está parado, sair do zero é o que faz mais diferença. Vinte minutos três vezes na semana já contam.",
      "A constância pesa mais do que um treino longo que acontece de vez em quando.",
      "Com o hábito criado, fica mais fácil aumentar o tempo e a intensidade aos poucos.",
    ],
  },
  {
    slug: "protetor-nublado",
    kind: "Mito ou verdade",
    title: "Em dia nublado não precisa de protetor solar?",
    dim: "aparencia",
    minutes: 2,
    verdict: "Mito",
    body: [
      "Boa parte da radiação ultravioleta passa pelas nuvens. Por isso o protetor vale também em dia nublado.",
      "Em cidades como Fortaleza, o índice UV costuma ser alto durante quase o ano todo.",
      "Reaplicar ao longo do dia, principalmente depois de suar ou entrar na água, faz diferença.",
    ],
  },
  {
    slug: "novembro-azul",
    kind: "Campanha",
    title: "Novembro Azul: um lembrete pra saúde do homem",
    dim: "saude",
    minutes: 3,
    body: [
      "O Novembro Azul é a campanha de conscientização sobre a saúde do homem, com foco na prevenção e no diagnóstico precoce do câncer de próstata.",
      "Muitos homens só procuram o médico quando já sentem alguma coisa. A ideia da campanha é inverter isso e manter as consultas de rotina em dia.",
      "A partir de que idade e quais exames fazer depende do seu histórico e da conversa com o médico. Vale levar a pergunta pro checkup.",
      "Aproveite o mês pra conferir quando foi seu último checkup.",
    ],
  },
];

export const CAMPAIGNS = {
  1: { title: "Janeiro Branco", text: "Mês da saúde mental. Um bom momento pra olhar pra como você está se sentindo.", dim: "mente", article: "psicologo-ou-psiquiatra" },
  9: { title: "Setembro Amarelo", text: "Mês de valorização da vida. Se precisar conversar, o CVV atende 24 horas pelo 188.", dim: "mente", article: "psicologo-ou-psiquiatra" },
  10: { title: "Outubro Rosa", text: "Mês de conscientização sobre o câncer de mama. Confira se suas consultas de rotina estão em dia.", dim: "saude", article: "checkup-preparar" },
  11: { title: "Novembro Azul", text: "Mês da saúde do homem. Confira quando foi seu último checkup.", dim: "saude", article: "novembro-azul" },
};

export function articleBySlug(slug) {
  return ARTICLES.find((a) => a.slug === slug) ?? null;
}

export function trailBySlug(slug) {
  return TRAILS.find((t) => t.slug === slug) ?? null;
}

export function challengeById(id) {
  return CHALLENGES.find((c) => c.id === id) ?? null;
}
