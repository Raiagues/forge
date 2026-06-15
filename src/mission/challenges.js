// ──────────────────────────────────────────────────────────────────
// Real-world challenge board (Prompt: Part 2) — curated seed challenges
// reflecting real Brazilian contexts where satellite tech has value.
// PURE data + helpers; the canonical store is the backend `challenges`
// table (seeded from this list), but the frontend bundles it as an
// offline fallback so the board works single-user with no server.
//
// Each challenge carries `category` (an objective-category id from
// objectives.js) and `seed: true` to distinguish curated seeds from real
// organisation submissions. `cards` pre-populate the brainstorming canvas
// zones when the challenge is selected, so a student lands on a concrete
// problem instead of a blank canvas.
// ──────────────────────────────────────────────────────────────────

export const SEED_CHALLENGES = [
  {
    id: 'mt-pragas-soja',
    org: 'Cooperativa agrícola — Mato Grosso',
    location: 'Sorriso, MT', region: 'MT',
    category: 'earth_obs',
    problem: 'Lavouras de soja e milho espalhadas por dezenas de milhares de hectares, muitas fora de cobertura celular. O monitoramento de pragas (ex.: Helicoverpa, percevejo) ainda é feito por amostragem em campo, lenta e localizada — focos crescem dias antes de serem vistos.',
    cost: 'Perdas por pragas no Brasil são estimadas em dezenas de bilhões de reais por ano; em MT, maior produtor de grãos, a detecção precoce em poucos dias reduz aplicação de defensivos e perda de produtividade.',
    value: 'Imagens multiespectrais periódicas que sinalizem estresse da lavoura por talhão, entregues mesmo sem rede terrestre.',
    cards: {
      objectives: ['Detectar estresse/pragas na lavoura por imagem multiespectral, por talhão'],
      constraints: ['Cobertura de grandes áreas rurais sem rede celular → downlink próprio', 'Revisita frequente exige órbita/sensor adequados'],
      questions: ['Qual resolução espacial distingue um foco útil para o agrônomo?', 'Revisita de quantos dias é aceitável para agir a tempo?'],
      failures: ['Cobertura de nuvens impede a leitura óptica', 'Banda/telemetria insuficiente para o volume de imagem'],
    },
  },
  {
    id: 'pa-enchentes',
    org: 'Defesa Civil municipal — Pará',
    location: 'Marabá, PA', region: 'PA',
    category: 'earth_obs',
    problem: 'Cheias dos rios da bacia amazônica desalojam milhares de pessoas todos os anos. A Defesa Civil precisa de nível de água e extensão de alagamento quase em tempo real para acionar evacuação, mas as estações fluviométricas são esparsas e falham na cheia.',
    cost: 'Cada cheia severa gera milhões de reais em danos e deslocamento de populações ribeirinhas; resposta rápida reduce perdas humanas e materiais.',
    value: 'Mapa de extensão de alagamento e tendência de nível atualizado em horas, independente das estações em terra.',
    cards: {
      objectives: ['Mapear extensão de alagamento e nível dos rios para resposta de emergência'],
      constraints: ['Resposta precisa ser quase em tempo real → latência de downlink crítica', 'Região com nuvem frequente → considerar sensoriamento que penetre nuvem'],
      questions: ['Qual latência (horas?) é útil para a Defesa Civil acionar evacuação?', 'Óptico basta ou é preciso radar pela cobertura de nuvens?'],
      failures: ['Nuvem persistente cega o sensor óptico no pico da cheia', 'Atraso de downlink torna o dado obsoleto para emergência'],
    },
  },
  {
    id: 'logistica-rastreio',
    org: 'Transportadora de cargas',
    location: 'Eixo BR-163 (MT/PA)', region: 'MT',
    category: 'communication',
    problem: 'Caminhões perdem rastreio ao sair da cobertura celular em trechos longos de rodovia, justamente onde o risco de desvio e roubo de carga é maior. O rastreador atual fica mudo por horas até reentrar em cobertura.',
    cost: 'O roubo de cargas no Brasil custa mais de R$ 1 bilhão por ano; a janela sem rastreio é o ponto cego explorado nos desvios.',
    value: 'Um canal de posição/telemetria de baixa taxa que funcione fora da cobertura terrestre, fechando o ponto cego.',
    cards: {
      objectives: ['Validar enlace de posição/telemetria de baixa taxa fora da cobertura celular'],
      constraints: ['Enlace intermitente conforme a passagem do satélite (LEO)', 'Mensagens curtas, baixo consumo no terminal embarcado'],
      questions: ['Qual intervalo entre passagens é tolerável para o rastreio?', 'Quantos bytes por mensagem bastam para posição + status?'],
      failures: ['Janela de contato curta demais perde a mensagem', 'Antena/terminal sem orientação adequada derruba o enlace'],
    },
  },
  {
    id: 'ibama-deter',
    org: 'IBAMA / fiscalização ambiental',
    location: 'Amazônia Legal', region: 'PA',
    category: 'earth_obs',
    problem: 'O sistema DETER (INPE) alerta desmatamento, mas tem lacunas temporais e de cobertura de nuvem que abrem janelas para desmate ilegal entre revisitas. A fiscalização chega tarde.',
    cost: 'Cada lacuna de monitoramento permite hectares de desmate ilegal; o custo ambiental e de fiscalização é elevado e recorrente.',
    value: 'Revisita complementar que reduza a janela entre alertas, sinalizando mudança de cobertura florestal mais cedo.',
    cards: {
      objectives: ['Reduzir a janela entre alertas de mudança de cobertura florestal'],
      constraints: ['Complementar (não substituir) o DETER → foco na revisita', 'Cobertura de nuvem na Amazônia limita o óptico'],
      questions: ['Que ganho de revisita é relevante frente ao DETER atual?', 'Como tratar a alta incidência de nuvens?'],
      failures: ['Nuvem mascara a área no momento da passagem', 'Falso positivo de mudança gera acionamento indevido'],
    },
  },
  {
    id: 'pa-mineracao-talude',
    org: 'Operação de mineração de pequeno porte',
    location: 'Sudeste do Pará', region: 'PA',
    category: 'earth_obs',
    problem: 'Taludes e pilhas em área remota, sem energia nem rede confiável, precisam de monitoramento de estabilidade. Movimentações milimétricas antecedem rupturas, mas não há instrumentação contínua no local.',
    cost: 'Rupturas de talude/barragem causam perdas humanas e ambientais catastróficas e paralisação da operação; o monitoramento preventivo é mandatório.',
    value: 'Indicador periódico de deformação de superfície na área crítica, entregue sem depender de infraestrutura local.',
    cards: {
      objectives: ['Acompanhar deformação de superfície de taludes em área remota'],
      constraints: ['Sítio remoto sem energia/rede → solução autônoma e downlink próprio', 'Deformação milimétrica exige técnica adequada (ex.: interferometria)'],
      questions: ['Qual sensibilidade (mm) e revisita detectam o pré-colapso a tempo?', 'Óptico é suficiente ou requer radar/InSAR?'],
      failures: ['Revisita longa demais perde a aceleração que antecede a ruptura', 'Resolução insuficiente não vê a deformação relevante'],
    },
  },
  {
    id: 'ne-pesca-tsm',
    org: 'Colônia de pescadores — Nordeste',
    location: 'Litoral do Ceará', region: 'CE',
    category: 'atmospheric',
    problem: 'A pesca artesanal gasta combustível procurando cardumes sem informação ambiental. A temperatura da superfície do mar (TSM) e frentes térmicas indicam onde há concentração de peixe, mas os pescadores não têm acesso a esse dado de forma simples.',
    cost: 'Combustível desperdiçado e baixa previsibilidade reduzem a renda de milhares de famílias da pesca artesanal no Nordeste.',
    value: 'Mapa simples de TSM/frentes térmicas da costa, acessível à colônia, para orientar onde pescar.',
    cards: {
      objectives: ['Disponibilizar TSM/frentes térmicas da costa para orientar a pesca'],
      constraints: ['Faixa costeira específica → cobertura e revisita dirigidas', 'Produto precisa ser simples de interpretar pela colônia'],
      questions: ['Qual resolução de TSM é útil para indicar cardume?', 'Como entregar o mapa de forma acessível ao pescador?'],
      failures: ['Nuvem impede a leitura térmica da superfície', 'Dado desatualizado não acompanha a frente térmica móvel'],
    },
  },
]

export const CHALLENGE_CATEGORIES = ['earth_obs', 'atmospheric', 'communication', 'radiation', 'attitude_control', 'tech_demo']

// filter + search over a challenge list
export function filterChallenges(list, { category = 'all', query = '' } = {}) {
  const q = query.trim().toLowerCase()
  return list.filter(c => {
    if (category !== 'all' && c.category !== category) return false
    if (!q) return true
    return [c.org, c.location, c.region, c.problem, c.value].join(' ').toLowerCase().includes(q)
  })
}
