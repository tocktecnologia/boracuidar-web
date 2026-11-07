// Catálogo do gerente de autocuidado (Minha rotina).
// Frequências e dicas são referências gerais e precisam de revisão profissional antes do lançamento.

export const DIMENSIONS = [
  { id: "movimento", label: "Movimento", short: "Movimento", question: "Como está o seu corpo em movimento?" },
  { id: "saude", label: "Saúde preventiva", short: "Saúde", question: "Como estão seus exames e consultas de rotina?" },
  { id: "mente", label: "Mente", short: "Mente", question: "Como você está cuidando da sua cabeça?" },
  { id: "sono", label: "Sono", short: "Sono", question: "Como você tem dormido?" },
  { id: "alimentacao", label: "Alimentação", short: "Alimentação", question: "Como está a sua alimentação?" },
  { id: "aparencia", label: "Aparência", short: "Aparência", question: "Como está o cuidado com cabelo, pele e unhas?" },
  { id: "tempo", label: "Tempo pra você", short: "Tempo livre", question: "Quanto tempo sobra pra você no dia a dia?" },
];

export const SCORE_LABELS = ["", "Esquecido", "Pouco", "Mais ou menos", "Bem", "Muito bem"];

// kind: "count" soma unidades no dia; "check" é feito ou não feito.
// period: "day" conta por dia; "week" conta quantas vezes na semana.
export const HABIT_CATALOG = [
  { id: "agua", label: "Beber água", dim: "alimentacao", kind: "count", target: 8, unit: "copos", period: "day", icon: "droplet" },
  { id: "treino", label: "Treinar", dim: "movimento", kind: "check", target: 3, unit: "vezes", period: "week", icon: "dumbbell" },
  { id: "caminhada", label: "Caminhar 20 minutos", dim: "movimento", kind: "check", target: 1, period: "day", icon: "footprints" },
  { id: "alongamento", label: "Alongar", dim: "movimento", kind: "check", target: 1, period: "day", icon: "stretch" },
  { id: "sono7", label: "Dormir 7 horas ou mais", dim: "sono", kind: "check", target: 1, period: "day", icon: "moon" },
  { id: "desacelerar", label: "Desligar as telas antes de dormir", dim: "sono", kind: "check", target: 1, period: "day", icon: "phone-off" },
  { id: "fruta", label: "Comer fruta ou verdura", dim: "alimentacao", kind: "check", target: 1, period: "day", icon: "apple" },
  { id: "respiracao", label: "Respirar com calma 5 minutos", dim: "mente", kind: "check", target: 1, period: "day", icon: "wind" },
  { id: "humor", label: "Anotar como estou me sentindo", dim: "mente", kind: "check", target: 1, period: "day", icon: "smile" },
  { id: "skincare", label: "Cuidar da pele", dim: "aparencia", kind: "check", target: 1, period: "day", icon: "sparkles" },
  { id: "fio", label: "Passar fio dental", dim: "saude", kind: "check", target: 1, period: "day", icon: "tooth" },
  { id: "remedio", label: "Tomar remédio ou suplemento", dim: "saude", kind: "check", target: 1, period: "day", icon: "pill" },
  { id: "leitura", label: "Ler ou fazer algo que eu gosto", dim: "tempo", kind: "check", target: 1, period: "day", icon: "book" },
  { id: "pausa", label: "Fazer uma pausa sem celular", dim: "tempo", kind: "check", target: 1, period: "day", icon: "coffee" },
];

// category = rótulo de tipo de negócio do marketplace (BUSINESS_TYPE_LABELS).
export const CYCLE_CATALOG = [
  { id: "corte", label: "Corte de cabelo", dim: "aparencia", intervalDays: 28, category: "Barbearia", verb: "cortou o cabelo", keywords: ["corte", "cabelo", "degradê", "degrade"] },
  { id: "barba", label: "Barba", dim: "aparencia", intervalDays: 14, category: "Barbearia", verb: "fez a barba", keywords: ["barba"] },
  { id: "unhas", label: "Unhas", dim: "aparencia", intervalDays: 14, category: "Salão de beleza", verb: "fez as unhas", keywords: ["unha", "manicure", "pedicure"] },
  { id: "sobrancelha", label: "Sobrancelha", dim: "aparencia", intervalDays: 25, category: "Estética", verb: "fez a sobrancelha", keywords: ["sobrancelha"] },
  { id: "pele", label: "Limpeza de pele", dim: "aparencia", intervalDays: 45, category: "Estética", verb: "fez limpeza de pele", keywords: ["limpeza de pele", "pele"] },
  { id: "dentista", label: "Revisão no dentista", dim: "saude", intervalDays: 180, category: "Clínica", verb: "foi ao dentista", keywords: ["dent", "odonto", "limpeza dental", "clareamento"] },
  { id: "checkup", label: "Checkup clínico", dim: "saude", intervalDays: 365, category: "Clínica", verb: "fez um checkup", keywords: ["checkup", "check-up", "clínico", "clinico", "consulta"] },
  { id: "exames", label: "Exames de sangue", dim: "saude", intervalDays: 365, category: "Clínica", verb: "fez exames de sangue", keywords: ["exame", "sangue", "laboratório"] },
  { id: "dermato", label: "Dermatologista", dim: "saude", intervalDays: 365, category: "Clínica", verb: "foi ao dermatologista", keywords: ["dermato"] },
  { id: "oftalmo", label: "Oftalmologista", dim: "saude", intervalDays: 540, category: "Clínica", verb: "foi ao oftalmologista", keywords: ["oftalmo", "vista"] },
  { id: "nutri", label: "Retorno com nutricionista", dim: "alimentacao", intervalDays: 45, category: "Clínica", verb: "foi à nutricionista", keywords: ["nutri"] },
  { id: "terapia", label: "Sessão de terapia", dim: "mente", intervalDays: 7, category: "Clínica", verb: "teve sessão de terapia", keywords: ["terapia", "psicólog", "psicolog", "sessão"] },
  { id: "massagem", label: "Massagem", dim: "tempo", intervalDays: 30, category: "Estética", verb: "fez massagem", keywords: ["massagem", "relaxante", "drenagem"] },
  { id: "personal", label: "Avaliação física", dim: "movimento", intervalDays: 90, category: "Personal", verb: "fez avaliação física", keywords: ["avaliação física", "avaliacao fisica", "personal"] },
];

// Perguntas de "última vez que" no Raio-X.
export const LAST_TIME_QUESTIONS = ["corte", "dentista", "checkup"];

export const LAST_TIME_OPTIONS = [
  { id: "mes", label: "Este mês", daysAgo: 10 },
  { id: "1a3", label: "1 a 3 meses", daysAgo: 60 },
  { id: "3a6", label: "3 a 6 meses", daysAgo: 135 },
  { id: "6a12", label: "6 meses a 1 ano", daysAgo: 270 },
  { id: "mais", label: "Mais de 1 ano", daysAgo: 450 },
  { id: "nao", label: "Não lembro", daysAgo: null },
];

export const INTERVAL_OPTIONS = [7, 14, 21, 28, 30, 45, 60, 90, 120, 180, 270, 365, 540, 730];

// Sugestões por dimensão usadas pra montar o plano inicial.
export const PLAN_BY_DIMENSION = {
  movimento: { habits: ["treino", "alongamento"], cycles: ["personal"] },
  saude: { habits: ["fio"], cycles: ["dentista", "checkup", "exames"] },
  mente: { habits: ["respiracao", "humor"], cycles: [] },
  sono: { habits: ["sono7", "desacelerar"], cycles: [] },
  alimentacao: { habits: ["fruta"], cycles: ["nutri"] },
  aparencia: { habits: ["skincare"], cycles: ["corte", "sobrancelha"] },
  tempo: { habits: ["leitura", "pausa"], cycles: ["massagem"] },
};

export const TIPS = [
  { dim: "alimentacao", text: "Deixe uma garrafa de água à vista na mesa de trabalho. Água que a gente vê é água que a gente bebe." },
  { dim: "alimentacao", text: "Monte metade do prato com verduras e legumes. Não precisa contar nada pra isso funcionar." },
  { dim: "alimentacao", text: "Fruta já lavada e na altura dos olhos na geladeira vira lanche mais fácil que biscoito." },
  { dim: "movimento", text: "Treino curto conta. Vinte minutos três vezes na semana valem mais que uma hora que nunca acontece." },
  { dim: "movimento", text: "Marque o treino na agenda como você marca uma reunião. Horário fixo ajuda o hábito a pegar." },
  { dim: "movimento", text: "Levante a cada hora sentado e caminhe dois minutos. Seu corpo agradece no fim do dia." },
  { dim: "sono", text: "Dormir e acordar perto do mesmo horário, inclusive no fim de semana, ajuda o sono a render mais." },
  { dim: "sono", text: "Deixe o celular fora do alcance da cama. Fica mais fácil não pegar nele antes de dormir." },
  { dim: "sono", text: "Quarto escuro, silencioso e fresco é meio caminho andado pra uma noite melhor." },
  { dim: "mente", text: "Respirar devagar, soltando o ar mais longo do que puxa, ajuda a baixar a ansiedade do momento." },
  { dim: "mente", text: "Terapia não é só pra crise. É um horário fixo na semana pra cuidar do que a gente carrega." },
  { dim: "mente", text: "Escrever uma linha sobre o seu dia ajuda a perceber o que te faz bem e o que te pesa." },
  { dim: "saude", text: "Revisão no dentista a cada seis meses costuma evitar tratamentos maiores. Seu dentista diz o ritmo certo pra você." },
  { dim: "saude", text: "Troque a escova de dentes a cada três meses, ou antes se as cerdas estiverem abertas." },
  { dim: "saude", text: "Guarde seus exames num lugar só. Na próxima consulta, isso economiza tempo e repetição." },
  { dim: "saude", text: "Checkup anual é a forma mais simples de descobrir cedo o que é fácil de cuidar." },
  { dim: "aparencia", text: "Protetor solar todo dia, até nublado, é o cuidado com a pele que mais compensa a longo prazo." },
  { dim: "aparencia", text: "Corte em dia segura o formato. Esperar demais costuma deixar o próximo corte mais difícil." },
  { dim: "tempo", text: "Reserve trinta minutos na semana só pra você, sem obrigação. Marque como compromisso." },
  { dim: "tempo", text: "Uma pausa de cinco minutos sem celular no meio da tarde já muda o resto do dia." },
  { dim: "tempo", text: "Cuidar de você também é saber dizer não pra uma coisa pra dizer sim pra outra." },
];

export const ACHIEVEMENTS = [
  { id: "raiox", label: "Primeiro Raio-X", description: "Você olhou pra todas as áreas do seu autocuidado." },
  { id: "semana", label: "Semana cumprida", description: "Fechou uma semana com a maior parte da rotina feita." },
  { id: "agua7", label: "7 dias de água", description: "Bateu a meta de água em 7 dias." },
  { id: "treino12", label: "12 treinos", description: "Somou 12 treinos registrados." },
  { id: "sequencia4", label: "Um mês de constância", description: "Quatro semanas seguidas com a rotina em dia." },
  { id: "agendou", label: "Primeiro agendamento", description: "Marcou um cuidado pelo BoraCuidar." },
  { id: "dentista", label: "Dente em dia", description: "Revisão no dentista dentro do prazo." },
  { id: "checkup", label: "Checkup do ano", description: "Fez o checkup clínico dentro do prazo." },
  { id: "tudoemdia", label: "Tudo em dia", description: "Todos os seus cuidados de manutenção dentro do prazo." },
];

export function dimensionById(id) {
  return DIMENSIONS.find((item) => item.id === id) ?? null;
}

export function habitById(id) {
  return HABIT_CATALOG.find((item) => item.id === id) ?? null;
}

export function cycleById(id) {
  return CYCLE_CATALOG.find((item) => item.id === id) ?? null;
}
