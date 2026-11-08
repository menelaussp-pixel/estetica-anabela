-- =====================================================================
-- Estética Anabela — avisos Web Push de marcações novas
-- Correr DEPOIS de 01_schema.sql
--
-- O segredo que liga a base de dados à função notificar-marcacao fica
-- no Vault do Supabase (nome: push_webhook_segredo), nunca neste ficheiro.
-- =====================================================================

create extension if not exists pg_net;

-- Um registo por cada dispositivo com notificações ativadas
create table if not exists public.push_subscricoes (
  id        uuid primary key default gen_random_uuid(),
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  criado_em timestamptz not null default now()
);

alter table public.push_subscricoes enable row level security;

drop policy if exists push_subscricoes_dona on public.push_subscricoes;
create policy push_subscricoes_dona on public.push_subscricoes
  for all to authenticated using (true) with check (true);

create or replace function public.avisar_nova_marcacao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_segredo text;
begin
  select decrypted_secret into v_segredo
    from vault.decrypted_secrets
   where name = 'push_webhook_segredo'
   limit 1;

  if v_segredo is not null then
    perform net.http_post(
      url     := 'https://iyohfkmmkdxgvremtorq.supabase.co/functions/v1/notificar-marcacao',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_segredo),
      body    := jsonb_build_object('marcacao_id', new.id)
    );
  end if;
  return new;
exception when others then
  -- Um aviso falhado nunca pode impedir uma marcação.
  return new;
end;
$$;

revoke all on function public.avisar_nova_marcacao() from public, anon, authenticated;

drop trigger if exists marcacoes_aviso_push on public.marcacoes;
create trigger marcacoes_aviso_push
  after insert on public.marcacoes
  for each row
  when (new.origem = 'cliente')
  execute function public.avisar_nova_marcacao();
