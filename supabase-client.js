/* ============================================================
   supabase-client.js — cria UM cliente Supabase compartilhado
   por todo o sistema (login + sincronização usam o mesmo).
   A chave "anon public" pode ficar aqui: a segurança de verdade
   vem do RLS (ver supabase-setup.sql), não de esconder a chave.
   ============================================================ */
(function () {
  var SUPABASE_URL = "https://cmfbnbgpcxbqerhxmakx.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZmJuYmdwY3hicWVyaHhtYWt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwODU4MTQsImV4cCI6MjA5ODY2MTgxNH0.8o9ePY-rRLpjVENHfdlRo_8cLDMuWUannaSG2hhwBjU";

  window.SB_CONFIG = { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };

  if (typeof supabase === "undefined") {
    console.error("[supabase] Biblioteca não carregou (confira o <script> do CDN no index.html).");
    window.SB = null;
    return;
  }

  // persistSession: mantém o login salvo entre reaberturas do app.
  window.SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
})();
