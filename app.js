(function () {
  'use strict';

  var LS_KEY = 'mapaAtivosDraft_v2';
  var TIPOS_PADRAO = ['Monitor', 'Telefone', 'CPU/Desktop', 'Notebook', 'Teclado', 'Mouse', 'Headset',
    'Nobreak', 'Dock', 'Webcam', 'Switch', 'Roteador', 'DVR', 'Servidor', 'Patch Panel', 'Access Point', 'Estabilizador', 'Outro'];
  var STATUS_ATIVO = [
    { valor: 'ok', rotulo: 'OK' },
    { valor: 'faltando', rotulo: 'Faltando' },
    { valor: 'defeito', rotulo: 'Defeito' },
    { valor: 'manutencao', rotulo: 'Manutenção' }
  ];
  var STATUS_LABEL = { ok: 'Tudo no lugar', warn: 'Atenção', alert: 'Fora do lugar / defeito', empty: 'Sem ativos' };
  var ICON_RACK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="3" width="16" height="18" rx="1.5"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><circle cx="7.5" cy="6" r=".6" fill="currentColor"/><circle cx="7.5" cy="12" r=".6" fill="currentColor"/><circle cx="7.5" cy="18" r=".6" fill="currentColor"/></svg>';

  var state = null;
  var deskEls = {};              // id -> elemento (chip ou rack-card)
  var posInfo = {};              // id -> info da sala { sala, sub, tipo, unica, indice, semRamal }
  var filtros = { status: '', tipo: '', foraLugar: false, semTelefone: false, semPc: false };
  var highlightIds = [];
  var draftTimer = null;

  function fecharDraftBanner() {
    clearTimeout(draftTimer);
    byId('draft-banner').classList.add('hidden');
  }

  // ---------------------------------------------------------------- utils
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function byId(id) { return document.getElementById(id); }

  function hoje() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function formatarDataHora(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  }
  function getBancada(id) {
    for (var i = 0; i < state.bancadas.length; i++) if (state.bancadas[i].id === id) return state.bancadas[i];
    return null;
  }
  function todosAtivos() {
    var lista = [];
    state.bancadas.forEach(function (b) { (b.ativos || []).forEach(function (a) { lista.push({ ativo: a, bancada: b }); }); });
    return lista;
  }

  // Info de sala a partir do LAYOUT (índices, sala única etc.)
  function construirPosInfo() {
    posInfo = {};
    function reg(sala, semRamal) {
      if (!sala.posicoes) return;
      sala.posicoes.forEach(function (id, k) {
        posInfo[id] = { sala: sala.nome, sub: sala.sub, tipo: sala.tipo || 'sala', unica: sala.posicoes.length === 1, indice: k + 1, semRamal: !!semRamal };
      });
    }
    LAYOUT.fileiraSuperior.salas.forEach(function (s) { reg(s); });
    reg({ nome: LAYOUT.rack.nome, sub: LAYOUT.rack.sub, tipo: 'rack', posicoes: LAYOUT.rack.posicoes }, true);
    LAYOUT.lateral.forEach(function (s) { reg(s); });
    LAYOUT.faixaInferior.forEach(function (s) { reg(s); });
  }

  function isSemRamal(b) { return !!(posInfo[b.id] && posInfo[b.id].semRamal); }

  // Nome legível de um local (bancada do salão ou posição de sala)
  function nomeLocal(b) {
    if (!b) return '—';
    var info = posInfo[b.id];
    if (!info) return 'Bancada ' + b.numero;
    if (info.unica) return info.sala;
    return info.sala + ' · ' + info.indice;
  }
  function nomeLocalPorId(id) { return nomeLocal(getBancada(id)); }

  function placeholderChip(b) {
    var info = posInfo[b.id];
    if (!info) return b.numero;                 // salão: número da posição
    if (info.tipo === 'reuniao') return '☎';    // reunião: só ramal
    return String(info.indice);                 // sala com várias posições
  }

  // ---------------------------------------------------------------- persistência
  function carregarRascunho() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      return (p && p.data && p.data.bancadas) ? p : null;
    } catch (e) { return null; }
  }
  var saveTimer = null;
  function salvarRascunho() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify({ data: state, savedAt: new Date().toISOString() })); }
      catch (e) { console.warn('Falha ao salvar rascunho:', e); }
    }, 250);
  }
  function mudouEstado() { salvarRascunho(); refreshAll(); }

  // Garante que todas as posições novas (ex.: salas) existam num rascunho antigo.
  function reconciliar() {
    var have = {};
    state.bancadas.forEach(function (b) { have[b.id] = true; });
    DADOS_INICIAIS.bancadas.forEach(function (b) { if (!have[b.id]) state.bancadas.push(clone(b)); });
  }

  // ---------------------------------------------------------------- status
  function ativoForaDoLugar(a, bancadaId) { return !!a.bancada_esperada && a.bancada_esperada !== bancadaId; }

  function getStatus(bancada) {
    var ativos = bancada.ativos || [];
    if (ativos.length === 0) return 'empty';
    var alerta = false, atencao = false;
    ativos.forEach(function (a) {
      if (a.status === 'defeito' || ativoForaDoLugar(a, bancada.id)) alerta = true;
      if (a.status === 'faltando' || a.status === 'manutencao') atencao = true;
    });
    if (alerta) return 'alert';
    if (atencao) return 'warn';
    return 'ok';
  }

  // ---------------------------------------------------------------- construir mapa
  function criarDesk(id, small) {
    var b = getBancada(id);
    var d = el('button', 'desk');
    d.type = 'button';
    d.dataset.id = id;
    if (small) d.dataset.sm = '1';
    d.appendChild(el('span', 'desk__pos', b ? b.numero : id));
    d.appendChild(el('span', 'desk__main'));
    d.addEventListener('click', function () { abrirModalBancada(id); });
    d.addEventListener('mouseenter', function (e) { mostrarTooltip(id, e.currentTarget); });
    d.addEventListener('mouseleave', esconderTooltip);
    deskEls[id] = d;
    return d;
  }

  function criarSala(sala) {
    var r = el('div', 'room room--' + (sala.tipo || 'apoio'));
    var head = el('div', 'room__head');
    head.appendChild(el('span', 'room__name', sala.nome));
    if (sala.sub) head.appendChild(el('span', 'room__sub', sala.sub));
    r.appendChild(head);
    if (sala.posicoes) {
      var grid = el('div', 'room__pos');
      sala.posicoes.forEach(function (id) { grid.appendChild(criarDesk(id, true)); });
      r.appendChild(grid);
    }
    return r;
  }

  function criarRack() {
    var id = LAYOUT.rack.posicoes[0];
    var r = el('button', 'rack-card');
    r.type = 'button';
    r.dataset.id = id;
    r.innerHTML =
      '<span class="rack-card__icon">' + ICON_RACK + '</span>' +
      '<span class="rack-card__name">' + LAYOUT.rack.nome + '</span>' +
      '<span class="rack-card__sub">' + LAYOUT.rack.sub + '</span>' +
      '<span class="rack-card__count" data-rack-count>vazio</span>';
    r.addEventListener('click', function () { abrirModalBancada(id); });
    r.addEventListener('mouseenter', function (e) { mostrarTooltip(id, e.currentTarget); });
    r.addEventListener('mouseleave', esconderTooltip);
    deskEls[id] = r;
    return r;
  }

  function bandLabel(txt) { return el('div', 'band__label', txt); }

  function criarBloco(bloco) {
    var sec = el('section', 'block');
    sec.appendChild(el('div', 'block__label', bloco.label));
    var mesas = el('div', 'block__mesas');
    bloco.mesas.forEach(function (par) {
      var mesa = el('div', 'mesa');
      par.forEach(function (id) { mesa.appendChild(criarDesk(id)); });
      mesas.appendChild(mesa);
    });
    sec.appendChild(mesas);
    return sec;
  }

  function construirMapa() {
    var floor = byId('floor');
    floor.innerHTML = '';
    deskEls = {};

    // Faixa superior
    var top = el('div', 'band band--top');
    top.appendChild(bandLabel(LAYOUT.fileiraSuperior.label));
    var toprow = el('div', 'toprow');
    LAYOUT.fileiraSuperior.clusters.forEach(function (c) {
      var cl = el('div', 'cluster cluster--' + c.tipo);
      c.ids.forEach(function (id) { cl.appendChild(criarDesk(id)); });
      toprow.appendChild(cl);
    });
    top.appendChild(toprow);
    var topRooms = el('div', 'toprow__rooms');
    LAYOUT.fileiraSuperior.salas.forEach(function (s) { topRooms.appendChild(criarSala(s)); });
    top.appendChild(topRooms);
    floor.appendChild(top);

    // Faixa principal (salão)
    var main = el('div', 'band band--main');
    LAYOUT.blocos.forEach(function (bloco, idx) {
      main.appendChild(criarBloco(bloco));
      if (idx === 2) main.appendChild(criarRack()); // rack entre blocos C e D
    });
    var side = el('div', 'side');
    LAYOUT.lateral.forEach(function (s) { side.appendChild(criarSala(s)); });
    main.appendChild(side);
    floor.appendChild(main);

    // Faixa inferior
    var bottom = el('div', 'band band--bottom');
    bottom.appendChild(bandLabel('Salas'));
    LAYOUT.faixaInferior.forEach(function (s) { bottom.appendChild(criarSala(s)); });
    floor.appendChild(bottom);

    // stagger da animação
    Object.keys(deskEls).forEach(function (id, i) { deskEls[id].style.animationDelay = Math.min(i * 5, 460) + 'ms'; });
  }

  // ---------------------------------------------------------------- refresh visual
  function refreshDesks() {
    state.bancadas.forEach(function (b) {
      var d = deskEls[b.id];
      if (!d) return;
      var status = getStatus(b);
      if (d.classList.contains('rack-card')) {
        d.className = 'rack-card rack-card--' + status;
        var n = (b.ativos || []).length;
        d.querySelector('[data-rack-count]').textContent = n ? (n + (n === 1 ? ' item' : ' itens')) : 'vazio';
        return;
      }
      var base = 'desk';
      if (d.dataset.sm) base += ' desk--sm';
      if (posInfo[b.id]) base += ' desk--room';
      d.className = base + ' desk--' + status + (b.ramal || isSemRamal(b) ? '' : ' desk--ghost');
      d.querySelector('.desk__main').textContent = b.ramal ? b.ramal : placeholderChip(b);
    });
    aplicarEnfase();
  }

  function passaFiltros(b) {
    var ativos = b.ativos || [];
    var status = getStatus(b);
    if (filtros.status) {
      if (filtros.status === 'vazio' && status !== 'empty') return false;
      if (filtros.status === 'ok' && status !== 'ok') return false;
      if (filtros.status === 'fora' && !ativos.some(function (a) { return ativoForaDoLugar(a, b.id); })) return false;
      if (filtros.status === 'faltando' && !ativos.some(function (a) { return a.status === 'faltando'; })) return false;
      if (filtros.status === 'defeito' && !ativos.some(function (a) { return a.status === 'defeito'; })) return false;
      if (filtros.status === 'manutencao' && !ativos.some(function (a) { return a.status === 'manutencao'; })) return false;
    }
    if (filtros.tipo && !ativos.some(function (a) { return a.tipo === filtros.tipo; })) return false;
    if (filtros.foraLugar && !ativos.some(function (a) { return ativoForaDoLugar(a, b.id); })) return false;
    if (filtros.semTelefone && ativos.some(function (a) { return a.tipo === 'Telefone'; })) return false;
    if (filtros.semPc && ativos.some(function (a) { return a.tipo === 'CPU/Desktop'; })) return false;
    return true;
  }

  function temFiltroAtivo() {
    return !!(filtros.status || filtros.tipo || filtros.foraLugar || filtros.semTelefone || filtros.semPc);
  }

  function aplicarEnfase() {
    var buscando = highlightIds.length > 0;
    var filtrando = temFiltroAtivo();
    state.bancadas.forEach(function (b) {
      var d = deskEls[b.id];
      if (!d) return;
      d.classList.remove('is-dim', 'is-hit');
      if (buscando) {
        if (highlightIds.indexOf(b.id) !== -1) d.classList.add('is-hit'); else d.classList.add('is-dim');
      } else if (filtrando) {
        if (passaFiltros(b)) d.classList.add('is-hit'); else d.classList.add('is-dim');
      }
    });
  }

  function refreshStats() {
    var lista = todosAtivos();
    var ok = 0, fora = 0, faltando = 0;
    lista.forEach(function (i) {
      if (ativoForaDoLugar(i.ativo, i.bancada.id)) fora++;
      if (i.ativo.status === 'faltando') faltando++;
      if (i.ativo.status === 'ok' && !ativoForaDoLugar(i.ativo, i.bancada.id)) ok++;
    });
    byId('stat-total').textContent = lista.length;
    byId('stat-ok').textContent = ok;
    byId('stat-fora').textContent = fora;
    byId('stat-faltando').textContent = faltando;
  }

  function refreshAll() { refreshDesks(); refreshStats(); }

  // ---------------------------------------------------------------- tooltip
  function mostrarTooltip(id, target) {
    var b = getBancada(id);
    if (!b) return;
    var status = getStatus(b);
    var n = (b.ativos || []).length;
    var tip = byId('tooltip');
    var html = '<div class="tooltip__title">' + nomeLocal(b) + '</div>';
    if (!isSemRamal(b) && b.ramal) html += '<div class="tooltip__ramal">Ramal ' + b.ramal + '</div>';
    html += '<div class="tooltip__row">' + n + ' ativo' + (n === 1 ? '' : 's') + '</div>';
    html += '<div class="tooltip__status" style="color:var(--' + status + ')">' + STATUS_LABEL[status] + '</div>';
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    var r = target.getBoundingClientRect();
    tip.style.left = (r.left + r.width / 2) + 'px';
    tip.style.top = (r.top - 8) + 'px';
  }
  function esconderTooltip() { byId('tooltip').classList.add('hidden'); }

  // ---------------------------------------------------------------- modal genérico
  function abrirModal(html) { byId('modal').innerHTML = html; byId('modal-overlay').classList.remove('hidden'); }
  function fecharModal() { byId('modal-overlay').classList.add('hidden'); byId('modal').innerHTML = ''; }
  byId('modal-overlay').addEventListener('click', function (e) { if (e.target.id === 'modal-overlay') fecharModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { fecharModal(); esconderTooltip(); } });

  // ---------------------------------------------------------------- modal da bancada
  function opcoesTipo(sel) { return TIPOS_PADRAO.map(function (t) { return '<option' + (t === sel ? ' selected' : '') + '>' + t + '</option>'; }).join(''); }
  function opcoesStatus(sel) { return STATUS_ATIVO.map(function (s) { return '<option value="' + s.valor + '"' + (s.valor === sel ? ' selected' : '') + '>' + s.rotulo + '</option>'; }).join(''); }
  function opcoesBancadas(exceto) {
    return state.bancadas.filter(function (b) { return b.id !== exceto; })
      .map(function (b) { return '<option value="' + b.id + '">' + nomeLocal(b) + (b.ramal ? ' · ramal ' + b.ramal : '') + '</option>'; }).join('');
  }
  function badge(a, bancadaId) {
    if (ativoForaDoLugar(a, bancadaId)) return '<span class="badge badge--alert">Fora — esperado: ' + nomeLocalPorId(a.bancada_esperada) + '</span>';
    if (a.status === 'defeito') return '<span class="badge badge--alert">Defeito</span>';
    if (a.status === 'faltando') return '<span class="badge badge--warn">Faltando</span>';
    if (a.status === 'manutencao') return '<span class="badge badge--warn">Manutenção</span>';
    return '<span class="badge badge--ok">OK</span>';
  }

  function abrirModalBancada(id) {
    var b = getBancada(id);
    if (!b) return;
    var semRamal = isSemRamal(b);
    var ro = !!window.MODO_LEITURA;   // papel "leitura": não edita

    var linhas = (b.ativos || []).map(function (a, idx) {
      return '<tr>' +
        '<td>' + a.tipo + '</td>' +
        '<td>' + (a.patrimonio || '—') + '</td>' +
        '<td>' + (a.modelo || '—') + '</td>' +
        '<td>' + (a.serie || '—') + '</td>' +
        '<td>' + badge(a, b.id) + '</td>' +
        '<td class="row-actions">' + (ro ? '' :
          '<button data-acao="mover" data-idx="' + idx + '">Mover</button>' +
          '<button data-acao="editar" data-idx="' + idx + '">Editar</button>' +
          '<button data-acao="remover" data-idx="' + idx + '" class="remover">Remover</button>') +
        '</td></tr>';
    }).join('');

    var header;
    if (semRamal) {
      header = '<div class="modal-header"><h2>' + nomeLocal(b) + '</h2><button class="modal-close" id="modal-fechar">&times;</button></div>';
    } else {
      var ramalBadge = b.ramal
        ? '<span class="ramal-badge">Ramal ' + b.ramal + '</span>'
        : '<span class="ramal-badge ramal-badge--empty">Ramal não definido</span>';
      header = '<div class="modal-header"><h2>' + nomeLocal(b) + ' ' + ramalBadge + '</h2><button class="modal-close" id="modal-fechar">&times;</button></div>';
    }

    var meta = semRamal
      ? '<div class="modal-meta"><span class="meta-hint">Local de equipamentos de rede — cadastre switches, roteadores, DVRs e afins abaixo.</span></div>'
      : '<div class="modal-meta"><label>Ramal<input type="text" id="edit-ramal" value="' + (b.ramal || '') + '" placeholder="ex: 4022"' + (ro ? ' readonly' : '') + '></label></div>';

    abrirModal(header + meta +
      '<table class="ativos-table"><thead><tr>' +
        '<th>Tipo</th><th>Patrimônio</th><th>Modelo</th><th>Série</th><th>Status</th><th></th></tr></thead>' +
        '<tbody id="ativos-tbody">' + (linhas || '<tr class="ativos-empty"><td colspan="6">Nenhum ativo cadastrado aqui ainda.</td></tr>') + '</tbody></table>' +
      (ro ? '' : '<button class="btn btn--primary btn--sm add-btn" id="btn-add-ativo">+ Adicionar ativo</button>') +
      '<div id="form-ativo-container"></div>');

    byId('modal-fechar').addEventListener('click', fecharModal);
    if (ro) return;   // somente leitura: sem handlers de edição
    if (!semRamal) byId('edit-ramal').addEventListener('change', function (e) { b.ramal = e.target.value.trim(); mudouEstado(); abrirModalBancada(id); });
    byId('btn-add-ativo').addEventListener('click', function () { formAtivo(b, null); });
    byId('ativos-tbody').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-acao]');
      if (!btn) return;
      var idx = parseInt(btn.dataset.idx, 10);
      if (btn.dataset.acao === 'remover') {
        if (confirm('Remover este ativo de ' + nomeLocal(b) + '?')) { b.ativos.splice(idx, 1); mudouEstado(); abrirModalBancada(id); }
      } else if (btn.dataset.acao === 'editar') { formAtivo(b, idx); }
      else if (btn.dataset.acao === 'mover') { formMover(b, idx); }
    });
  }

  function formAtivo(b, idx) {
    var editando = idx !== null;
    var a = editando ? b.ativos[idx] : { tipo: TIPOS_PADRAO[0], patrimonio: '', modelo: '', serie: '', status: 'ok', bancada_esperada: b.id };
    byId('form-ativo-container').innerHTML =
      '<div class="form-ativo">' +
        '<label>Tipo<select id="f-tipo">' + opcoesTipo(a.tipo) + '</select></label>' +
        '<label>Status<select id="f-status">' + opcoesStatus(a.status) + '</select></label>' +
        '<label>Patrimônio<input id="f-patrimonio" value="' + (a.patrimonio || '') + '"></label>' +
        '<label>Modelo<input id="f-modelo" value="' + (a.modelo || '') + '"></label>' +
        '<label>Série<input id="f-serie" value="' + (a.serie || '') + '"></label>' +
        '<label>Local esperado (nº)<input id="f-esperada" value="' + (a.bancada_esperada || '') + '"></label>' +
        '<div class="form-actions">' +
          '<button class="btn btn--ghost btn--sm" id="f-cancelar">Cancelar</button>' +
          '<button class="btn btn--primary btn--sm" id="f-salvar">' + (editando ? 'Salvar' : 'Adicionar') + '</button>' +
        '</div></div>';
    byId('f-cancelar').addEventListener('click', function () { byId('form-ativo-container').innerHTML = ''; });
    byId('f-salvar').addEventListener('click', function () {
      var novo = {
        tipo: byId('f-tipo').value, status: byId('f-status').value,
        patrimonio: byId('f-patrimonio').value.trim(), modelo: byId('f-modelo').value.trim(),
        serie: byId('f-serie').value.trim(), bancada_esperada: parseInt(byId('f-esperada').value, 10) || b.id
      };
      if (editando) b.ativos[idx] = novo; else { b.ativos = b.ativos || []; b.ativos.push(novo); }
      mudouEstado(); abrirModalBancada(b.id);
    });
  }

  function formMover(b, idx) {
    var a = b.ativos[idx];
    byId('form-ativo-container').innerHTML =
      '<div class="form-ativo">' +
        '<label class="full">Mover "' + a.tipo + ' (' + (a.patrimonio || 'sem patrimônio') + ')" para:' +
          '<select id="f-destino">' + opcoesBancadas(b.id) + '</select></label>' +
        '<div class="form-actions">' +
          '<button class="btn btn--ghost btn--sm" id="f-cancelar-mv">Cancelar</button>' +
          '<button class="btn btn--primary btn--sm" id="f-mover">Mover ativo</button>' +
        '</div></div>';
    byId('f-cancelar-mv').addEventListener('click', function () { byId('form-ativo-container').innerHTML = ''; });
    byId('f-mover').addEventListener('click', function () {
      var destino = getBancada(parseInt(byId('f-destino').value, 10));
      if (!destino) return;
      b.ativos.splice(idx, 1);
      destino.ativos = destino.ativos || [];
      destino.ativos.push(a);
      mudouEstado(); abrirModalBancada(destino.id);
    });
  }

  // ---------------------------------------------------------------- busca
  function executarBusca() {
    var termo = byId('busca-input').value.trim().toLowerCase();
    var out = byId('busca-resultado');
    highlightIds = [];
    if (!termo) { out.innerHTML = ''; aplicarEnfase(); return; }
    var achados = todosAtivos().filter(function (i) {
      var a = i.ativo;
      return (a.patrimonio && a.patrimonio.toLowerCase().indexOf(termo) !== -1) ||
             (a.serie && a.serie.toLowerCase().indexOf(termo) !== -1) ||
             (a.modelo && a.modelo.toLowerCase().indexOf(termo) !== -1);
    });
    highlightIds = achados.map(function (i) { return i.bancada.id; });
    if (!achados.length) {
      out.innerHTML = '<div class="result-empty">Nenhum ativo encontrado.</div>';
    } else {
      out.innerHTML = achados.map(function (i) {
        return '<div class="result-item" data-id="' + i.bancada.id + '">' + i.ativo.tipo +
          ' <small>' + (i.ativo.patrimonio || 's/ patrim.') + '</small><br><small>' + nomeLocal(i.bancada) +
          (i.bancada.ramal ? ' · ramal ' + i.bancada.ramal : '') + '</small></div>';
      }).join('');
      out.querySelectorAll('.result-item').forEach(function (elm) {
        elm.addEventListener('click', function () {
          var id = parseInt(elm.dataset.id, 10);
          var d = deskEls[id];
          if (d) { d.scrollIntoView({ behavior: 'smooth', block: 'center' }); d.classList.add('is-flash'); setTimeout(function () { d.classList.remove('is-flash'); }, 1900); }
          abrirModalBancada(id);
        });
      });
    }
    aplicarEnfase();
  }

  // ---------------------------------------------------------------- filtros
  function popularTipos() {
    byId('filtro-tipo').innerHTML = '<option value="">Todos</option>' + TIPOS_PADRAO.map(function (t) { return '<option>' + t + '</option>'; }).join('');
  }
  function aplicarFiltros() {
    filtros.status = byId('filtro-status').value;
    filtros.tipo = byId('filtro-tipo').value;
    filtros.foraLugar = byId('filtro-fora-lugar').checked;
    filtros.semTelefone = byId('filtro-sem-telefone').checked;
    filtros.semPc = byId('filtro-sem-pc').checked;
    aplicarEnfase();
  }
  function limparFiltros() {
    byId('filtro-status').value = ''; byId('filtro-tipo').value = '';
    byId('filtro-fora-lugar').checked = false; byId('filtro-sem-telefone').checked = false; byId('filtro-sem-pc').checked = false;
    filtros = { status: '', tipo: '', foraLugar: false, semTelefone: false, semPc: false };
    aplicarEnfase();
  }

  // ---------------------------------------------------------------- auditoria
  function rodarAuditoria() {
    var lista = todosAtivos();
    var fora = lista.filter(function (i) { return ativoForaDoLugar(i.ativo, i.bancada.id); });
    var faltando = lista.filter(function (i) { return i.ativo.status === 'faltando'; });
    var defeito = lista.filter(function (i) { return i.ativo.status === 'defeito'; });
    var manut = lista.filter(function (i) { return i.ativo.status === 'manutencao'; });

    function tabela(items, extra) {
      if (!items.length) return '<div class="result-empty">Nenhum registro.</div>';
      return '<table class="ativos-table"><thead><tr><th>Local</th><th>Tipo</th><th>Patrimônio</th>' + (extra ? '<th>Esperado</th>' : '') + '</tr></thead><tbody>' +
        items.map(function (i) {
          return '<tr><td>' + nomeLocal(i.bancada) + '</td><td>' + i.ativo.tipo + '</td><td>' + (i.ativo.patrimonio || '—') + '</td>' +
            (extra ? '<td>' + nomeLocalPorId(i.ativo.bancada_esperada) + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table>';
    }

    abrirModal(
      '<div class="modal-header"><h2>Auditoria · esperado × atual</h2><button class="modal-close" id="modal-fechar">&times;</button></div>' +
      '<div class="audit-summary">' +
        '<div class="audit-box"><strong>' + lista.length + '</strong><span>Ativos</span></div>' +
        '<div class="audit-box audit-box--alert"><strong>' + fora.length + '</strong><span>Fora do lugar</span></div>' +
        '<div class="audit-box audit-box--warn"><strong>' + faltando.length + '</strong><span>Faltando</span></div>' +
        '<div class="audit-box audit-box--alert"><strong>' + defeito.length + '</strong><span>Defeito</span></div>' +
      '</div>' +
      '<h3>Fora do lugar</h3>' + tabela(fora, true) +
      '<h3>Faltando</h3>' + tabela(faltando) +
      '<h3>Defeito</h3>' + tabela(defeito) +
      '<h3>Manutenção</h3>' + tabela(manut)
    );
    byId('modal-fechar').addEventListener('click', fecharModal);
  }

  // ---------------------------------------------------------------- import / export
  function exportarJSON() {
    state.atualizado_em = hoje();
    baixar('dados.json', new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    salvarRascunho();
  }
  function importarJSON(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var p = JSON.parse(e.target.result);
        if (!p || !Array.isArray(p.bancadas)) throw new Error('Formato inválido');
        if (!confirm('Importar vai substituir todos os dados atuais (inclusive o rascunho deste navegador). Continuar?')) return;
        state = p;
        reconciliar();
        salvarRascunho();
        byId('draft-banner').classList.add('hidden');
        refreshAll();
        alert('Dados importados com sucesso.');
      } catch (err) { alert('Não foi possível importar: ' + err.message); }
    };
    reader.readAsText(file);
  }

  function exportarCSV() {
    var linhas = [['Local', 'Ramal', 'Tipo', 'Patrimônio', 'Modelo', 'Série', 'Status', 'Situação']];
    todosAtivos().forEach(function (i) {
      linhas.push([nomeLocal(i.bancada), i.bancada.ramal || '', i.ativo.tipo, i.ativo.patrimonio || '', i.ativo.modelo || '',
        i.ativo.serie || '', i.ativo.status, ativoForaDoLugar(i.ativo, i.bancada.id) ? 'Fora do lugar' : 'No lugar']);
    });
    var csv = linhas.map(function (l) {
      return l.map(function (v) { var s = String(v).replace(/"/g, '""'); return /[",;\n]/.test(s) ? '"' + s + '"' : s; }).join(';');
    }).join('\r\n');
    baixar('inventario_ativos.csv', new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  }

  var LOGO_PRINT = '<img src="assets/logo-eztec-cor.png" alt="Eztec Brokers" style="height:42px">';

  function imprimirRelatorio() {
    var linhas = todosAtivos().map(function (i) {
      return '<tr><td>' + nomeLocal(i.bancada) + '</td><td>' + (i.bancada.ramal || '') + '</td><td>' + i.ativo.tipo + '</td><td>' +
        (i.ativo.patrimonio || '') + '</td><td>' + (i.ativo.modelo || '') + '</td><td>' + (i.ativo.serie || '') + '</td><td>' +
        i.ativo.status + '</td><td>' + (ativoForaDoLugar(i.ativo, i.bancada.id) ? 'Fora do lugar' : 'No lugar') + '</td></tr>';
    }).join('');
    byId('print-area').innerHTML =
      '<div class="print-header">' + LOGO_PRINT +
        '<div class="print-title">Inventário de ativos de TI<span>7º Pavimento · EZ Brokers</span></div></div>' +
      '<p class="print-date">Gerado em ' + new Date().toLocaleString('pt-BR') + '</p>' +
      '<table><thead><tr><th>Local</th><th>Ramal</th><th>Tipo</th><th>Patrimônio</th><th>Modelo</th><th>Série</th><th>Status</th><th>Situação</th></tr></thead><tbody>' +
      linhas + '</tbody></table>';
    window.print();
  }

  function baixar(nome, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------- init
  function init() {
    construirPosInfo();

    var draft = carregarRascunho();
    if (draft) {
      state = draft.data;
      reconciliar();
      byId('draft-banner-texto').textContent = 'Alterações recuperadas — salvas neste navegador em ' + formatarDataHora(draft.savedAt) + '.';
      byId('draft-banner').classList.remove('hidden');
      draftTimer = setTimeout(fecharDraftBanner, 8000);
    } else {
      state = clone(DADOS_INICIAIS);
    }

    construirMapa();
    popularTipos();
    refreshAll();

    byId('btn-draft-fechar').addEventListener('click', fecharDraftBanner);

    byId('btn-auditoria').addEventListener('click', rodarAuditoria);
    byId('btn-exportar').addEventListener('click', exportarJSON);
    byId('btn-importar').addEventListener('click', function () { byId('input-importar').click(); });
    byId('input-importar').addEventListener('change', function (e) { if (e.target.files[0]) importarJSON(e.target.files[0]); e.target.value = ''; });

    byId('busca-btn').addEventListener('click', executarBusca);
    byId('busca-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') executarBusca(); });
    byId('busca-input').addEventListener('input', function (e) { if (!e.target.value.trim()) { highlightIds = []; byId('busca-resultado').innerHTML = ''; aplicarEnfase(); } });

    ['filtro-status', 'filtro-tipo', 'filtro-fora-lugar', 'filtro-sem-telefone', 'filtro-sem-pc'].forEach(function (id) {
      byId(id).addEventListener('change', aplicarFiltros);
    });
    byId('btn-limpar-filtros').addEventListener('click', limparFiltros);
    byId('toggle-posicoes').addEventListener('change', function (e) { byId('floor').classList.toggle('show-pos', e.target.checked); });

    byId('btn-csv').addEventListener('click', exportarCSV);
    byId('btn-imprimir').addEventListener('click', imprimirRelatorio);
  }

  // O login (auth.js) chama isto após validar a sessão e baixar os dados da nuvem.
  window.iniciarApp = init;
})();
