# Especificação — Sistema de Mapa de Ativos (EZ Brokers, 7º Pavimento)

> Documento para colar no Claude Code como briefing do projeto.
> Autor: Kaique (Analista de Suporte de TI). Data: 02/07/2026.

---

## 1. Objetivo

Criar um sistema **visual e interativo** que mostre a planta do escritório e permita
identificar rapidamente **onde está cada ativo de TI** por bancada. Serve para:

- Localizar equipamentos em manutenção sem procurar bancada por bancada.
- Auditar o escritório: comparar onde o ativo **deveria estar** (estado instalado pelo TI)
  com onde ele **está agora**, destacando o que saiu do lugar.
- Manter um inventário organizado por bancada, com número da bancada e ramal.

**Problema de negócio:** corretores trocam periféricos, telefones e monitores de lugar.
O sistema dá visibilidade e evidência para cobrar a organização.

---

## 2. Decisões já tomadas (não reabrir)

| Tema | Decisão |
|------|---------|
| **Uso** | Local, só o Kaique usa. Sem servidor, sem login. |
| **Persistência** | Arquivo local (JSON). Portátil e versionável. |
| **Mapa** | Usar a planta real do arquiteto como imagem de fundo (`planta_baixa_7pav.png`). Sem o recorte de zoom das salas de baixo. |
| **Campos do ativo** | Tipo, Nº de patrimônio, Modelo, Nº de série, Status. |
| **Funções** | Consulta + Busca/filtros + Edição (CRUD) + Auditoria (esperado × atual) + Exportar relatório. |

---

## 3. Stack recomendada

Como é **local e single-user**, o mais simples e robusto:

- **Aplicação web single-page** rodando no próprio PC (abrir o `index.html` no navegador
  ou servir com um servidor local leve).
- **Sem framework pesado obrigatório.** HTML + CSS + JavaScript puro já resolve.
  Se preferir organização, React via Vite é aceitável — mas não é necessário.
- **Mapa clicável:** um `<div>` com a imagem da planta de fundo e uma camada **SVG**
  por cima com as zonas clicáveis (uma por bancada). SVG escala junto com a imagem.
- **Dados:** arquivo `dados.json`. Para persistir alterações localmente sem backend,
  usar o **File System Access API** (salvar/abrir o JSON pelo navegador) ou botões
  de **Importar/Exportar JSON**. Evitar depender só de `localStorage` (dado importante
  não pode viver só no cache do navegador).

> **Importante para o Claude Code:** priorizar uma solução de **arquivo único** ou
> pasta simples que o Kaique consiga abrir com duplo clique. Nada de Docker/servidor.

---

## 4. Modelo de dados

Arquivo `dados.json` (ver `dados_exemplo.json` já gerado com as 95 bancadas):

```json
{
  "escritorio": "EZ Brokers - 7º Pavimento - Rua Cubatão, 320",
  "atualizado_em": "2026-07-02",
  "bancadas": [
    {
      "id": 22,
      "numero": "22",
      "ramal": "4022",
      "area": "Bloco A",
      "ativos": [
        {
          "tipo": "Monitor",
          "patrimonio": "EZ-01234",
          "modelo": "Dell P2422H",
          "serie": "CN0ABC123",
          "status": "ok",
          "posicao_esperada": true
        }
      ]
    }
  ]
}
```

**Campos do ativo:**

- `tipo` — Monitor, Telefone, CPU/Desktop, Teclado, Mouse, Headset, Nobreak, Dock, etc.
- `patrimonio` — nº de patrimônio (identificador principal).
- `modelo` — marca/modelo.
- `serie` — número de série.
- `status` — `ok` | `faltando` | `defeito` | `manutencao`.
- `posicao_esperada` — `true` = é o lugar correto definido pelo TI. Usado na auditoria.

**Auditoria (esperado × atual):** a forma mais simples é manter **dois arquivos** ou
dois campos por ativo: o **layout base** (onde o TI instalou) e o **estado atual**.
Recomendo: cada ativo tem um campo `bancada_esperada` (nº da bancada onde deveria estar).
Se o ativo aparecer numa bancada diferente da esperada, o sistema marca como
**"fora do lugar"**. Assim a auditoria é só varrer os ativos e comparar
`bancada_atual` vs `bancada_esperada`.

---

## 5. Funcionalidades (requisitos)

### 5.1 Mapa interativo
- Exibir a planta com todas as bancadas.
- Cada bancada é uma **zona clicável**. Ao clicar, abre um **painel/modal** com:
  - Título: **Bancada Nº X — Ramal YYYY**.
  - Lista dos ativos daquela bancada (tipo, patrimônio, modelo, série, status).
- **Cor da bancada por status:** verde (tudo ok), amarelo (algo faltando/em manutenção),
  vermelho (ativo fora do lugar ou com defeito), cinza (sem ativos cadastrados).

### 5.2 Edição (CRUD)
- Adicionar / editar / remover ativos de uma bancada pelo próprio modal.
- Editar o ramal e a área da bancada.
- **Mover ativo** de uma bancada para outra (registra que saiu do lugar esperado).
- Salvar alterações no `dados.json` (Exportar / File System Access API).

### 5.3 Busca e filtros
- Buscar por **nº de patrimônio**, número de série ou modelo → destaca a bancada no mapa.
- Filtrar bancadas por: status, tipo de ativo, "somente fora do lugar",
  "bancadas sem telefone", "bancadas sem monitor".

### 5.4 Auditoria (esperado × atual)
- Botão **"Rodar auditoria"**: percorre todos os ativos e lista os que estão
  em bancada diferente da esperada, os faltando e os com defeito.
- Destacar no mapa (vermelho) as bancadas com divergência.
- Resumo no topo: total de ativos, quantos ok, quantos fora do lugar, quantos faltando.

### 5.5 Exportar relatório
- Exportar o inventário / resultado da auditoria em **PDF e/ou Excel (CSV/XLSX)**.
- Colunas: Bancada, Ramal, Tipo, Patrimônio, Modelo, Série, Status, Situação (no lugar / fora do lugar).

---

## 6. UI/UX

- Layout: **mapa ocupa a área principal**; barra lateral (ou topo) com busca, filtros
  e botões (Rodar auditoria, Exportar, Importar/Salvar JSON).
- Modal da bancada limpo, com o cabeçalho **Bancada + Ramal** em destaque.
- Legenda de cores sempre visível.
- Responsivo o suficiente para uso em notebook. Não precisa de mobile.
- Tom visual sóbrio (uso interno de TI), foco em clareza e leitura rápida.

---

## 7. Estrutura das bancadas (referência da planta)

95 posições numeradas. Na planta os números aparecem **em pares** (duas posições por mesa).
Distribuição observada (para posicionar as zonas clicáveis):

- **Fileira superior (topo):** 1 (solta), 2–7, 8 (solta), 9–14, 15–20, 21 (solta).
  Pares: 2/5, 3/6, 4/7 · 9/12, 10/13, 11/14 · 15/18, 16/19, 17/20.
- **Bloco A:** 22/23, 24/25, 26/27, 28/29, 30/31.
- **Bloco B:** 32/33, 34/35, 36/37, 38/39, 40/41, 42/43, 44/45.
- **Bloco C:** 46/47, 48/49, 50/51, 52/53, 54/55, 56/57.
- **Centro:** Estação Micro Reuniões / Área de Gravação (sem bancadas numeradas).
- **Bloco D:** 58/59, 60/61, 62/63, 64/65, 66/67, 68/69.
- **Bloco E:** 70/71, 72/73, 74/75, 76/77, 78/79, 80/81, 82/83.
- **Bloco F:** 84/85, 86/87, 88/89, 90/91, 92/93, 94/95.
- **Salas:** Reunião 01, Reunião 02 (Rússia), Diretoria, ADM, Parceria, Recepção,
  Copa/Café, Call Station, Hall, Circulação. (Opcional cadastrar ativos dessas salas depois.)

> **Como criar as zonas clicáveis:** usar a imagem `planta_baixa_7pav.png` como fundo e
> desenhar retângulos SVG sobre cada bancada. As coordenadas devem ser calibradas uma vez
> (sugiro um "modo de edição de zonas" onde você clica-e-arrasta para criar cada retângulo
> e o sistema salva as coordenadas no JSON). Isso evita adivinhar 95 posições no código.

---

## 8. Roteiro de implementação sugerido (para o Claude Code)

1. **Esqueleto:** `index.html`, `style.css`, `app.js`, `dados.json`, e a imagem `planta_baixa_7pav.png`.
2. **Renderizar o mapa:** imagem de fundo + camada SVG responsiva.
3. **Modo editor de zonas:** criar/ajustar retângulos clicáveis por bancada e salvar coords no JSON. (Fazer isso cedo — é o que mais dá trabalho manual.)
4. **Vincular dados:** carregar `dados.json` e pintar cada bancada pela cor do status.
5. **Modal da bancada:** cabeçalho Bancada + Ramal, lista de ativos, botões de CRUD.
6. **Persistência:** File System Access API (abrir/salvar dados.json) + Importar/Exportar.
7. **Busca e filtros.**
8. **Auditoria** (esperado × atual) com destaque no mapa e resumo.
9. **Exportar relatório** (CSV/XLSX e PDF).
10. **Teste com dados reais:** preencher ramais e alguns ativos, validar auditoria.

---

## 9. Pendências que dependem de você (Kaique)

- **Ramais:** você disse que já tem o mapeamento de ramais. Preencher a coluna `ramal`
  no `dados.json` (ou importar de uma planilha que você já tenha).
- **Inventário inicial:** patrimônio/modelo/série dos ativos por bancada.
- **Definir o "estado esperado":** qual ativo pertence a qual bancada (base da auditoria).

---

## 10. Ideias futuras (não bloqueiam o MVP)

- Registrar **data/hora** e responsável na movimentação de um ativo (mini-histórico).
- **Foto** do ativo ou da bancada.
- QR Code por bancada para conferência rápida no local.
- Se um dia precisar de multiusuário, migrar o JSON para SQLite + um backend leve.
