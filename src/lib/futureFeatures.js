// ──────────────────────────────────────────────────────────────────
// Future features — contextual explanations for everything that is
// not implemented yet. Nothing in the UI is "dead": clicking a
// coming-soon module/competition/feature opens a panel that explains
// what it will do, why it matters in the mission workflow and what is
// planned. Pure data.
// ──────────────────────────────────────────────────────────────────

export const FUTURE_FEATURES = {
  // ── hardware modules ────────────────────────────────────────────
  ccs811: {
    title: 'Sensor de CO₂ e qualidade do ar',
    tech: 'CCS811 · I²C 0x5A · 30 mA',
    what: 'Mede CO₂ equivalente (400–8192 ppm) e compostos orgânicos voláteis (TVOC) no ar.',
    why: 'Missões de qualidade do ar correlacionam CO₂/VOCs com altitude e temperatura — um dos payloads científicos mais comuns no OBSAT.',
    planned: [
      'Driver I²C com warm-up de 20 min modelado na simulação',
      'Regra de validação: aquecimento antes do voo',
      'Campo co2/tvoc no pacote de telemetria',
    ],
  },
  gps_neo6m: {
    title: 'Posição GPS',
    tech: 'NEO-6M · UART2 · 50 mA',
    what: 'Recebe posição, altitude e velocidade via satélites GNSS (sentenças NMEA, 1 Hz).',
    why: 'Permite rastrear a trajetória do balão e recuperar o payload pela última posição conhecida.',
    planned: [
      'Fiação UART (TX/RX cruzados) com validação no editor de pinos',
      'Simulação de aquisição de fix (cold start)',
      'Trajetória no painel de telemetria',
    ],
  },
  lora_sx1276: {
    title: 'Rádio LoRa de longo alcance',
    tech: 'SX1276 · SPI · 915 MHz · 120 mA em TX',
    what: 'Enlace de rádio de baixa taxa e longo alcance (vários km) para telemetria fora do alcance do WiFi.',
    why: 'No OBSAT o WiFi é obrigatório, mas LoRa é o enlace secundário típico para acompanhar o voo inteiro.',
    planned: [
      'Fiação SPI (MOSI/MISO/SCK/CS) no editor de pinos',
      'Orçamento de enlace (potência, SF, distância) na validação',
      'RSSI/SNR simulados na telemetria',
    ],
  },
  sd_card: {
    title: 'Cartão de memória',
    tech: 'MicroSD · SPI · 100 mA em escrita',
    what: 'Grava todas as amostras localmente em CSV — o backup quando o enlace cai.',
    why: 'Competições pontuam robustez: dados completos recuperados após o voo valem tanto quanto a telemetria ao vivo.',
    planned: [
      'Módulo de logging no firmware gerado',
      'Estimativa de volume de dados por duração de missão',
      'Validação: backup recomendado pelo OBSAT',
    ],
  },
  lipo_2000: {
    title: 'Bateria',
    tech: 'LiPo 2000 mAh · 3.7 V · 40 g',
    what: 'Fonte de energia do payload, com medição de tensão via divisor no ADC.',
    why: 'O orçamento de energia define a autonomia da missão — requisito obrigatório das competições.',
    planned: [
      'Autonomia calculada a partir do consumo real dos módulos',
      'Curva de descarga com efeito do frio em altitude',
      'Validação de autonomia mínima por janela de operação',
    ],
  },
  // ── competitions ────────────────────────────────────────────────
  framework_lasc: {
    title: 'LASC · Latin American Space Challenge',
    tech: 'competição · foguetes e CanSats',
    what: 'Estrutura de requisitos da LASC: massa, recuperação, telemetria de voo de foguete.',
    why: 'Cada competição traz regras de validação próprias — o FORGE foi arquitetado para carregá-las como dados.',
    planned: [
      'Requisitos declarativos (mesmo formato do OBSAT)',
      'Perfis de voo de foguete na simulação',
    ],
  },
  framework_cansat: {
    title: 'CanSat Brasil',
    tech: 'competição · satélite-lata',
    what: 'Missão em queda livre com paraquedas: telemetria rápida, massa ≤ 350 g, dimensões de uma lata.',
    why: 'Formato educacional clássico — restrições de volume tornam a validação de massa/dimensão central.',
    planned: [
      'Regras de massa e volume no validador',
      'Simulação de descida com taxa de amostragem alta',
    ],
  },
  // ── platform features ───────────────────────────────────────────
  pin_remap: {
    title: 'Remapeamento manual de pinos',
    tech: 'editor de fiação',
    what: 'Hoje a fiação manual já permite usar GPIOs alternativos para o I²C; o remapeamento assistido (arrastar a atribuição no inspetor) ainda não existe.',
    why: 'Conflitos de barramento em projetos maiores exigem realocar pinos sem refazer a fiação inteira.',
    planned: [
      'Arrastar atribuições no inspetor',
      'Sugestão automática de pinos livres em conflito',
    ],
  },
  settings: {
    title: 'Configurações do projeto',
    tech: 'preferências',
    what: 'Preferências do workspace: unidades, idioma, tema, atalhos.',
    why: 'Personalização vem depois da consolidação do fluxo de missão.',
    planned: ['Persistência de projetos (salvar/abrir)', 'Exportar relatório da missão'],
  },
}

export const getFeatureInfo = (key) => FUTURE_FEATURES[key] || null
