/*
 * layout.js — Modelo espacial do 7º pavimento (EZ Brokers).
 * O mapa é GERADO a partir daqui. Salas com "posicoes" recebem chips mapeáveis.
 */
const LAYOUT = {
  // Faixa superior: clusters ao longo do topo. "single" = 1 posição; "stack" = 2 (topo/baixo).
  fileiraSuperior: {
    label: 'Fileira Superior',
    clusters: [
      { tipo: 'single', ids: [1] },
      { tipo: 'stack', ids: [2, 5] },
      { tipo: 'stack', ids: [3, 6] },
      { tipo: 'stack', ids: [4, 7] },
      { tipo: 'single', ids: [8] },
      { tipo: 'stack', ids: [9, 12] },
      { tipo: 'stack', ids: [10, 13] },
      { tipo: 'stack', ids: [11, 14] },
      { tipo: 'stack', ids: [15, 18] },
      { tipo: 'stack', ids: [16, 19] },
      { tipo: 'stack', ids: [17, 20] },
      { tipo: 'single', ids: [21] }
    ],
    // Reunião 02 fica no topo à direita — 1 posição (só ramal).
    salas: [
      { nome: 'Reunião 02', tipo: 'reuniao', posicoes: [201] }
    ]
  },

  // Salão: blocos como colunas de "mesas" (pares de 2 posições).
  blocos: [
    { id: 'A', label: 'Bloco A', mesas: [[22, 23], [24, 25], [26, 27], [28, 29], [30, 31]] },
    { id: 'B', label: 'Bloco B', mesas: [[32, 33], [34, 35], [36, 37], [38, 39], [40, 41], [42, 43], [44, 45]] },
    { id: 'C', label: 'Bloco C', mesas: [[46, 47], [48, 49], [50, 51], [52, 53], [54, 55], [56, 57]] },
    { id: 'D', label: 'Bloco D', mesas: [[58, 59], [60, 61], [62, 63], [64, 65], [66, 67], [68, 69]] },
    { id: 'E', label: 'Bloco E', mesas: [[70, 71], [72, 73], [74, 75], [76, 77], [78, 79], [80, 81], [82, 83]] },
    { id: 'F', label: 'Bloco F', mesas: [[84, 85], [86, 87], [88, 89], [90, 91], [92, 93], [94, 95]] }
  ],

  // Rack de TI — no centro do salão (onde ficava a estação de micro reuniões).
  // Guarda os equipamentos de rede/servidores; não tem ramal, só ativos.
  rack: { nome: 'Rack de TI', sub: 'Switches · Roteadores · DVRs', posicoes: [200] },

  // Lado direito do salão — Recepção tem 1 posição (equipamentos na mesa).
  lateral: [
    { nome: 'Recepção', tipo: 'apoio', posicoes: [250] }
  ],

  // Faixa inferior: salas administrativas + Reunião 01.
  faixaInferior: [
    { nome: 'Superintendência', tipo: 'admin', posicoes: [211, 212, 213, 214] },
    { nome: 'ADM', tipo: 'admin', posicoes: [221, 222, 223, 224, 225, 226, 227, 228] },
    { nome: 'Jurídico', tipo: 'admin', posicoes: [241, 242, 243, 244, 245, 246, 247, 248] },
    { nome: 'Diretoria', tipo: 'admin', posicoes: [231, 232, 233] },
    { nome: 'Reunião 01', tipo: 'reuniao', posicoes: [202] }
  ]
};
