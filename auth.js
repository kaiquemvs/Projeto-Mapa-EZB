/* ============================================================
   auth.js — login (Supabase Auth), sessão, papéis e painel de admin.
   Fluxo: verifica sessão -> se logado, carrega dados da nuvem e
   inicia o app; senão, mostra a tela de login. A segurança real
   está no RLS do banco (ver supabase-setup.sql).
   ============================================================ */
(function () {
  var SB = window.SB;
  var perfilAtual = null;

  function q(id) { return document.getElementById(id); }
  function mostra(el) { el && el.classList.remove('hidden'); }
  function esconde(el) { el && el.classList.add('hidden'); }

  function traduzErro(msg) {
    msg = (msg || '').toLowerCase();
    if (msg.indexOf('invalid login') !== -1 || msg.indexOf('invalid credentials') !== -1) return 'E-mail ou senha incorretos.';
    if (msg.indexOf('email not confirmed') !== -1) return 'E-mail ainda não confirmado. Confira sua caixa de entrada.';
    if (msg.indexOf('network') !== -1 || msg.indexOf('fetch') !== -1) return 'Sem conexão com o servidor. Verifique sua internet.';
    return 'Não foi possível entrar: ' + msg;
  }

  function mostrarErro(msg) {
    var e = q('auth-erro');
    e.textContent = msg || '';
    e.style.display = msg ? 'block' : 'none';
  }

  // ---------------------------------------------------------------- estados da tela
  function mostrarFormLogin() {
    q('auth-loading').style.display = 'none';
    q('auth-form').style.display = 'block';
    mostra(q('auth-overlay'));
  }

  function setBtnEntrando(on) {
    var b = q('auth-entrar');
    b.disabled = on;
    b.textContent = on ? 'Entrando…' : 'Entrar';
  }

  // ---------------------------------------------------------------- sessão / início
  function aoTerSessao(session) {
    // Busca o perfil (papel). Se ainda não existir, trata como leitura.
    SB.from('perfis').select('*').eq('id', session.user.id).maybeSingle().then(function (r) {
      var perfil = (r && r.data) ? r.data : { id: session.user.id, email: session.user.email, nome: session.user.email, papel: 'leitura' };
      perfilAtual = perfil;
      iniciarComPerfil(perfil);
    });
  }

  function iniciarComPerfil(perfil) {
    var podeEditar = perfil.papel === 'admin' || perfil.papel === 'editor';
    window.MODO_LEITURA = !podeEditar;
    document.body.classList.toggle('modo-leitura', !podeEditar);

    var sync = window.SupaSync ? window.SupaSync.iniciar({ podeGravar: podeEditar }) : Promise.resolve();
    sync.then(function () {
      if (window.iniciarApp) window.iniciarApp();
      if (window.SupaSync) window.SupaSync.escutar();
      montarMenuUsuario(perfil);
      esconde(q('auth-overlay'));
      mostra(q('app-shell'));
    });
  }

  function fazerLogin() {
    var email = q('auth-email').value.trim();
    var senha = q('auth-senha').value;
    if (!email || !senha) { mostrarErro('Preencha e-mail e senha.'); return; }
    mostrarErro('');
    setBtnEntrando(true);
    SB.auth.signInWithPassword({ email: email, password: senha }).then(function (r) {
      if (r.error) { setBtnEntrando(false); mostrarErro(traduzErro(r.error.message)); return; }
      aoTerSessao(r.data.session); // mantém "Entrando…" até o app aparecer
    });
  }

  function sair() {
    SB.auth.signOut().then(function () { location.reload(); });
  }

  // ---------------------------------------------------------------- menu de usuário
  var PAPEL_ROTULO = { admin: 'Administrador', editor: 'Editor', leitura: 'Somente leitura' };

  function montarMenuUsuario(perfil) {
    var menu = q('user-menu');
    q('user-nome').textContent = perfil.nome || perfil.email;
    q('user-papel').textContent = PAPEL_ROTULO[perfil.papel] || perfil.papel;
    q('user-avatar').textContent = (perfil.nome || perfil.email || '?').charAt(0).toUpperCase();
    q('btn-admin').style.display = (perfil.papel === 'admin') ? '' : 'none';
    mostra(menu);

    q('user-menu-btn').onclick = function (e) { e.stopPropagation(); q('user-drop').classList.toggle('hidden'); };
    document.addEventListener('click', function () { esconde(q('user-drop')); });
    q('btn-sair').onclick = sair;
    q('btn-admin').onclick = abrirAdmin;
  }

  // ---------------------------------------------------------------- painel de admin
  function abrirAdmin() {
    esconde(q('user-drop'));
    var lista = q('admin-lista');
    lista.innerHTML = '<div class="admin-carregando">Carregando usuários…</div>';
    mostra(q('admin-overlay'));
    SB.from('perfis').select('*').order('criado_em', { ascending: true }).then(function (r) {
      if (r.error) { lista.innerHTML = '<div class="admin-erro">Não foi possível carregar: ' + r.error.message + '</div>'; return; }
      renderAdmin(r.data || []);
    });
  }

  function renderAdmin(perfis) {
    var lista = q('admin-lista');
    if (!perfis.length) { lista.innerHTML = '<div class="admin-carregando">Nenhum usuário ainda.</div>'; return; }
    var papeis = ['admin', 'editor', 'leitura'];
    lista.innerHTML =
      '<table class="admin-table"><thead><tr><th>Usuário</th><th>E-mail</th><th>Papel</th></tr></thead><tbody>' +
      perfis.map(function (p) {
        var eu = perfilAtual && p.id === perfilAtual.id;
        var opts = papeis.map(function (x) { return '<option value="' + x + '"' + (x === p.papel ? ' selected' : '') + '>' + PAPEL_ROTULO[x] + '</option>'; }).join('');
        return '<tr>' +
          '<td>' + (p.nome || '—') + (eu ? ' <span class="admin-voce">você</span>' : '') + '</td>' +
          '<td class="admin-email">' + (p.email || '—') + '</td>' +
          '<td><select class="admin-papel" data-id="' + p.id + '">' + opts + '</select></td>' +
          '</tr>';
      }).join('') + '</tbody></table>';

    lista.querySelectorAll('.admin-papel').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var id = sel.dataset.id, novo = sel.value;
        sel.disabled = true;
        SB.from('perfis').update({ papel: novo }).eq('id', id).then(function (r) {
          sel.disabled = false;
          if (r.error) { alert('Não foi possível alterar o papel: ' + r.error.message); abrirAdmin(); }
        });
      });
    });
  }

  // ---------------------------------------------------------------- init
  function init() {
    q('auth-entrar').addEventListener('click', fazerLogin);
    q('auth-senha').addEventListener('keydown', function (e) { if (e.key === 'Enter') fazerLogin(); });
    q('admin-fechar').addEventListener('click', function () { esconde(q('admin-overlay')); });
    q('admin-overlay').addEventListener('click', function (e) { if (e.target.id === 'admin-overlay') esconde(q('admin-overlay')); });

    if (!SB) { mostrarFormLogin(); mostrarErro('Não foi possível conectar ao servidor (biblioteca do Supabase não carregou). Verifique sua internet.'); return; }

    SB.auth.getSession().then(function (r) {
      if (r.data && r.data.session) { aoTerSessao(r.data.session); }
      else { mostrarFormLogin(); }
    }).catch(function () { mostrarFormLogin(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
