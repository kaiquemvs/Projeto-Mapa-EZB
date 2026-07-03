/* ============================================================
   supabase-sync.js — sincroniza os dados do mapa com a nuvem.
   Só entra em ação DEPOIS do login (o auth.js chama .iniciar()).
   Usa o cliente compartilhado window.SB.
   ============================================================ */
(function () {
  var TABLE = "kv_store";
  var CHAVE = "mapaAtivosDraft_v2";       // a mesma chave que o app usa
  var AUTO_RELOAD_ON_REMOTE = true;        // atualiza a tela quando outra pessoa edita

  var sb = window.SB;
  var _setItem = localStorage.setItem.bind(localStorage);
  var _removeItem = localStorage.removeItem.bind(localStorage);
  var applyingRemote = false;
  var podeGravar = false;                   // definido no .iniciar() conforme o papel
  var ligado = false;

  function push(value) {
    if (!ligado || !podeGravar || !sb) return;
    sb.from(TABLE)
      .upsert({ key: CHAVE, value: String(value), updated_at: new Date().toISOString() })
      .then(function (r) { if (r.error) console.error("[sync] falha ao salvar na nuvem:", r.error.message); });
  }

  // Intercepta as gravações do app -> espelha na nuvem
  localStorage.setItem = function (key, value) {
    _setItem(key, value);
    if (!applyingRemote && key === CHAVE) push(value);
  };
  localStorage.removeItem = function (key) {
    _removeItem(key);
    if (!applyingRemote && ligado && podeGravar && key === CHAVE && sb) {
      sb.from(TABLE).delete().eq("key", CHAVE).then(function () {});
    }
  };

  function applyRemote(value) {
    applyingRemote = true;
    if (value === null) _removeItem(CHAVE); else _setItem(CHAVE, value);
    applyingRemote = false;
  }

  // Baixa os dados da nuvem para o localStorage (antes do app desenhar).
  function hydrate() {
    if (!sb) return Promise.resolve();
    return sb.from(TABLE).select("value").eq("key", CHAVE).maybeSingle().then(function (r) {
      if (r.error) { console.error("[sync] erro ao ler a nuvem:", r.error.message); return; }
      var atualLocal = localStorage.getItem(CHAVE);
      if (!r.data) {
        // Nuvem vazia: se este PC já tem dados e pode gravar, envia (migração 1ª vez)
        if (atualLocal && podeGravar) { push(atualLocal); console.log("[sync] dados deste PC enviados para a nuvem."); }
        return;
      }
      if (r.data.value !== atualLocal) { applyRemote(r.data.value); console.log("[sync] dados carregados da nuvem."); }
    });
  }

  // Tempo real: quando outro PC edita, recarrega para mostrar o mais recente.
  function subscribe() {
    if (!sb) return;
    sb.channel("kv-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, function (payload) {
        var row = payload.new || payload.old;
        if (!row || row.key !== CHAVE) return;
        applyRemote(payload.eventType === "DELETE" ? null : row.value);
        if (AUTO_RELOAD_ON_REMOTE) location.reload();
      })
      .subscribe();
  }

  window.SupaSync = {
    // opts: { podeGravar: true/false }
    iniciar: function (opts) {
      ligado = true;
      podeGravar = !!(opts && opts.podeGravar);
      return hydrate();
    },
    escutar: subscribe,
    push: push
  };
})();
