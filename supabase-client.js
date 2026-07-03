/* ============================================================
   supabase-client.js — cria UM cliente Supabase compartilhado
   por todo o sistema (login + sincronização usam o mesmo).
   A chave "anon public" pode ficar aqui: a segurança de verdade
   vem do RLS (ver supabase-setup.sql), não de esconder a chave.
   ============================================================ */
(function () {
  var SUPABASE_URL = "https://dxefzfvogohbykhxtsrm.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4ZWZ6ZnZvZ29oYnlraHh0c3JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMDEzMzQsImV4cCI6MjA5ODY3NzMzNH0.oCRu_yQKRfCFPny3UwEfrjBm0q52Ln5sdH9ACIEXdyc";

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
