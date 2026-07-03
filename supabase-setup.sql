-- ============================================================
-- SEGURANÇA DO MAPA OPERACIONAL — rode este script UMA vez.
-- Onde: painel do Supabase -> menu "SQL Editor" -> New query ->
-- cole tudo -> RUN.
--
-- O que ele faz:
--   1. Cria a tabela de PERFIS (quem tem acesso e qual o papel).
--   2. Faz o 1º usuário criado virar ADMIN automaticamente.
--   3. Liga o RLS (Row Level Security): a partir daqui, SÓ quem
--      estiver logado consegue ler os dados, e SÓ admin/editor
--      consegue gravar. A "leitura" só enxerga.
--
-- IMPORTANTE: depois de rodar isto, o app vai EXIGIR login.
-- ============================================================

-- ---------- 1) Tabela de perfis (papéis de acesso) ----------
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  nome       text,
  papel      text not null default 'leitura' check (papel in ('admin','editor','leitura')),
  criado_em  timestamptz default now()
);

-- ---------- 2) Função que devolve o papel do usuário logado ----------
-- (security definer evita recursão de RLS ao consultar a própria tabela)
create or replace function public.papel_do_usuario()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select papel from public.perfis where id = auth.uid();
$$;

-- ---------- 3) Cria um perfil automaticamente a cada novo usuário ----------
-- O 1º usuário do sistema já nasce ADMIN; os demais nascem "leitura".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  qtd int;
begin
  select count(*) into qtd from public.perfis;
  insert into public.perfis (id, email, nome, papel)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    case when qtd = 0 then 'admin' else 'leitura' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 4) RLS da tabela de perfis ----------
alter table public.perfis enable row level security;

drop policy if exists "perfis_select" on public.perfis;
create policy "perfis_select" on public.perfis
  for select to authenticated using (true);           -- todo logado vê a lista

drop policy if exists "perfis_update_admin" on public.perfis;
create policy "perfis_update_admin" on public.perfis
  for update to authenticated
  using  (public.papel_do_usuario() = 'admin')         -- só admin muda papéis
  with check (public.papel_do_usuario() = 'admin');

-- ---------- 5) RLS da tabela de dados (kv_store) ----------
alter table public.kv_store enable row level security;

drop policy if exists "kv_select" on public.kv_store;
create policy "kv_select" on public.kv_store
  for select to authenticated using (true);            -- logado lê

drop policy if exists "kv_write" on public.kv_store;
create policy "kv_write" on public.kv_store
  for all to authenticated
  using  (public.papel_do_usuario() in ('admin','editor'))   -- só admin/editor grava
  with check (public.papel_do_usuario() in ('admin','editor'));

-- ---------- 6) Backfill: cria perfil pra quem já existia ----------
insert into public.perfis (id, email, nome, papel)
select u.id, u.email, split_part(u.email, '@', 1), 'leitura'
from auth.users u
where not exists (select 1 from public.perfis p where p.id = u.id);

-- torna o usuário mais antigo ADMIN, se ainda não houver nenhum admin
update public.perfis set papel = 'admin'
where id = (select id from auth.users order by created_at asc limit 1)
  and not exists (select 1 from public.perfis where papel = 'admin');

-- ============================================================
-- (Opcional) Forçar um e-mail específico como admin:
-- update public.perfis set papel = 'admin' where email = 'seu-email@exemplo.com';
-- ============================================================
