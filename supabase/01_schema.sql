-- =====================================================================
-- Estética Anabela — esquema da base de dados
-- Executar no Supabase: SQL Editor > New query > colar > Run
-- Pode ser executado mais do que uma vez sem estragar nada.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Definições gerais (uma única linha, id = 1)
-- ---------------------------------------------------------------------
create table if not exists public.definicoes (
  id                int primary key default 1,
  nome_salao        text not null default 'Estética Anabela',
  telemovel_salao   text default '',
  morada            text default '',
  aviso_senhoras    text not null default '',
  aviso_senhores    text not null default '',
  intervalo_min     int  not null default 15,
  antecedencia_min  int  not null default 60,   -- quanto tempo antes é possível marcar
  dias_futuro       int  not null default 60,   -- até quantos dias à frente se pode marcar
  atualizado_em     timestamptz not null default now(),
  constraint definicoes_singleton check (id = 1)
);

-- ---------------------------------------------------------------------
-- Horário de funcionamento (0 = domingo ... 6 = sábado)
-- ---------------------------------------------------------------------
create table if not exists public.horarios (
  dia_semana    int primary key check (dia_semana between 0 and 6),
  fechado       boolean not null default false,
  manha_inicio  time,
  manha_fim     time,
  tarde_inicio  time,
  tarde_fim     time
);

-- ---------------------------------------------------------------------
-- Serviços
-- ---------------------------------------------------------------------
create table if not exists public.servicos (
  id          uuid primary key default gen_random_uuid(),
  categoria   text not null check (categoria in ('senhoras','senhores')),
  nome        text not null,
  preco       numeric(10,2) not null check (preco >= 0),
  duracao_min int not null check (duracao_min > 0),
  ativo       boolean not null default true,
  ordem       int not null default 0,
  criado_em   timestamptz not null default now()
);

create index if not exists servicos_ordem_idx on public.servicos (categoria, ordem);
create unique index if not exists servicos_nome_cat_idx on public.servicos (categoria, lower(nome));

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create table if not exists public.clientes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  telemovel  text not null unique,
  notas      text default '',
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Marcações
-- ---------------------------------------------------------------------
create table if not exists public.marcacoes (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid references public.clientes(id) on delete set null,
  nome         text not null,
  telemovel    text not null,
  inicio       timestamptz not null,
  fim          timestamptz not null,
  duracao_min  int not null,
  total        numeric(10,2) not null default 0,
  estado       text not null default 'pendente'
               check (estado in ('pendente','confirmada','recusada','cancelada')),
  nota         text default '',
  origem       text not null default 'cliente' check (origem in ('cliente','salao')),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim > inicio)
);

create index if not exists marcacoes_inicio_idx on public.marcacoes (inicio);
create index if not exists marcacoes_estado_idx on public.marcacoes (estado);

-- Linhas de serviço de cada marcação (preço/duração congelados no momento da marcação)
create table if not exists public.marcacao_servicos (
  id          uuid primary key default gen_random_uuid(),
  marcacao_id uuid not null references public.marcacoes(id) on delete cascade,
  servico_id  uuid references public.servicos(id) on delete set null,
  nome        text not null,
  categoria   text not null,
  preco       numeric(10,2) not null,
  duracao_min int not null
);

create index if not exists marcacao_servicos_m_idx on public.marcacao_servicos (marcacao_id);

-- ---------------------------------------------------------------------
-- Bloqueios (férias, folgas, almoços extra)
-- ---------------------------------------------------------------------
create table if not exists public.bloqueios (
  id      uuid primary key default gen_random_uuid(),
  inicio  timestamptz not null,
  fim     timestamptz not null,
  motivo  text default '',
  check (fim > inicio)
);

create index if not exists bloqueios_inicio_idx on public.bloqueios (inicio);

-- ---------------------------------------------------------------------
-- atualizado_em automático
-- ---------------------------------------------------------------------
create or replace function public.tg_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists marcacoes_atualizado_em on public.marcacoes;
create trigger marcacoes_atualizado_em before update on public.marcacoes
  for each row execute function public.tg_atualizado_em();

-- =====================================================================
-- ROW LEVEL SECURITY
-- Regra de ouro: quem não tem sessão iniciada (o público) NUNCA consegue
-- ler clientes nem marcações. Só vê serviços, horários e os avisos.
-- =====================================================================

alter table public.definicoes        enable row level security;
alter table public.horarios          enable row level security;
alter table public.servicos          enable row level security;
alter table public.clientes          enable row level security;
alter table public.marcacoes         enable row level security;
alter table public.marcacao_servicos enable row level security;
alter table public.bloqueios         enable row level security;

-- Leitura pública: só o que é preciso para mostrar a tabela de preços
drop policy if exists definicoes_leitura_publica on public.definicoes;
create policy definicoes_leitura_publica on public.definicoes
  for select to anon, authenticated using (true);

drop policy if exists horarios_leitura_publica on public.horarios;
create policy horarios_leitura_publica on public.horarios
  for select to anon, authenticated using (true);

drop policy if exists servicos_leitura_publica on public.servicos;
create policy servicos_leitura_publica on public.servicos
  for select to anon, authenticated using (ativo or auth.role() = 'authenticated');

-- Escrita e leitura total: apenas a dona (sessão iniciada)
do $$
declare t text;
begin
  foreach t in array array['definicoes','horarios','servicos','clientes','marcacoes','marcacao_servicos','bloqueios']
  loop
    execute format('drop policy if exists %I_dona on public.%I', t, t);
    execute format(
      'create policy %I_dona on public.%I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

-- O público não tem QUALQUER política de select em clientes/marcacoes,
-- portanto não consegue ler nomes nem telemóveis. As marcações entram
-- exclusivamente pela função criar_marcacao() abaixo.

-- =====================================================================
-- FUNÇÕES
-- =====================================================================

-- ---------------------------------------------------------------------
-- slots_disponiveis(data, duração) -> horas livres nesse dia
-- security definer: consegue ver as marcações para calcular ocupação,
-- mas devolve apenas horas, nunca dados de clientes.
-- ---------------------------------------------------------------------
create or replace function public.slots_disponiveis(p_data date, p_duracao int)
returns table (inicio timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz        constant text := 'Europe/Lisbon';
  v_intervalo int;
  v_antec     int;
  v_dias      int;
  v_h         record;
  v_janela    record;
  v_cursor    timestamptz;
  v_fim_slot  timestamptz;
  v_limite    timestamptz;
begin
  if p_duracao is null or p_duracao <= 0 then
    return;
  end if;

  select coalesce(intervalo_min, 15), coalesce(antecedencia_min, 0), coalesce(dias_futuro, 60)
    into v_intervalo, v_antec, v_dias
    from definicoes where id = 1;

  v_intervalo := coalesce(v_intervalo, 15);
  v_antec     := coalesce(v_antec, 0);
  v_dias      := coalesce(v_dias, 60);

  if p_data > (now() at time zone v_tz)::date + v_dias then
    return;
  end if;

  select * into v_h from horarios
   where dia_semana = extract(dow from p_data)::int;

  if v_h is null or v_h.fechado then
    return;
  end if;

  for v_janela in
    select * from (values
      (v_h.manha_inicio, v_h.manha_fim),
      (v_h.tarde_inicio, v_h.tarde_fim)
    ) as j(abre, fecha)
    where j.abre is not null and j.fecha is not null and j.fecha > j.abre
  loop
    v_cursor := timezone(v_tz, (p_data + v_janela.abre)::timestamp);
    v_limite := timezone(v_tz, (p_data + v_janela.fecha)::timestamp);

    while v_cursor < v_limite loop
      v_fim_slot := v_cursor + make_interval(mins => p_duracao);

      if v_fim_slot <= v_limite
         and v_cursor >= now() + make_interval(mins => v_antec)
         and not exists (
           select 1 from marcacoes m
            where m.estado in ('pendente','confirmada')
              and m.inicio < v_fim_slot and m.fim > v_cursor)
         and not exists (
           select 1 from bloqueios b
            where b.inicio < v_fim_slot and b.fim > v_cursor)
      then
        inicio := v_cursor;
        return next;
      end if;

      v_cursor := v_cursor + make_interval(mins => v_intervalo);
    end loop;
  end loop;
end $$;

revoke all on function public.slots_disponiveis(date, int) from public;
grant execute on function public.slots_disponiveis(date, int) to anon, authenticated;

-- ---------------------------------------------------------------------
-- dias_com_vagas(ano, mês, duração) -> dias do mês que têm pelo menos 1 slot
-- ---------------------------------------------------------------------
create or replace function public.dias_com_vagas(p_ano int, p_mes int, p_duracao int)
returns table (dia date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d date := make_date(p_ano, p_mes, 1);
  v_f date := (make_date(p_ano, p_mes, 1) + interval '1 month')::date;
begin
  while v_d < v_f loop
    if exists (select 1 from slots_disponiveis(v_d, p_duracao) limit 1) then
      dia := v_d;
      return next;
    end if;
    v_d := v_d + 1;
  end loop;
end $$;

revoke all on function public.dias_com_vagas(int, int, int) from public;
grant execute on function public.dias_com_vagas(int, int, int) to anon, authenticated;

-- ---------------------------------------------------------------------
-- criar_marcacao(...) -> cria a marcação a partir do site público.
-- O preço e a duração são recalculados no servidor: o que vem do
-- telemóvel do cliente nunca é aceite como verdade.
-- ---------------------------------------------------------------------
create or replace function public.criar_marcacao(
  p_nome        text,
  p_telemovel   text,
  p_inicio      timestamptz,
  p_servico_ids uuid[],
  p_nota        text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total     numeric(10,2) := 0;
  v_duracao   int := 0;
  v_fim       timestamptz;
  v_cliente   uuid;
  v_marcacao  uuid;
  v_nome      text := btrim(coalesce(p_nome, ''));
  v_tel       text := regexp_replace(coalesce(p_telemovel, ''), '[^0-9+]', '', 'g');
  v_nota      text := left(btrim(coalesce(p_nota, '')), 500);
  s           record;
begin
  if length(v_nome) < 2 then
    raise exception 'Indique o seu nome.' using errcode = '22023';
  end if;
  if length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 9 then
    raise exception 'Indique um número de telemóvel válido.' using errcode = '22023';
  end if;
  if p_servico_ids is null or array_length(p_servico_ids, 1) is null then
    raise exception 'Escolha pelo menos um serviço.' using errcode = '22023';
  end if;
  if array_length(p_servico_ids, 1) > 12 then
    raise exception 'Demasiados serviços numa só marcação.' using errcode = '22023';
  end if;

  for s in
    select * from servicos
     where id = any(p_servico_ids) and ativo
  loop
    v_total   := v_total + s.preco;
    v_duracao := v_duracao + s.duracao_min;
  end loop;

  if v_duracao = 0 then
    raise exception 'Os serviços escolhidos já não estão disponíveis.' using errcode = '22023';
  end if;

  v_fim := p_inicio + make_interval(mins => v_duracao);

  -- o horário tem de continuar livre (dois clientes ao mesmo tempo)
  if not exists (
    select 1 from slots_disponiveis(
      (p_inicio at time zone 'Europe/Lisbon')::date, v_duracao) sd
     where sd.inicio = p_inicio)
  then
    raise exception 'Esse horário deixou de estar disponível. Escolha outro, por favor.'
      using errcode = '22023';
  end if;

  insert into clientes (nome, telemovel)
       values (v_nome, v_tel)
  on conflict (telemovel) do update set nome = excluded.nome
    returning id into v_cliente;

  insert into marcacoes (cliente_id, nome, telemovel, inicio, fim, duracao_min, total, nota, origem)
       values (v_cliente, v_nome, v_tel, p_inicio, v_fim, v_duracao, v_total, v_nota, 'cliente')
    returning id into v_marcacao;

  insert into marcacao_servicos (marcacao_id, servico_id, nome, categoria, preco, duracao_min)
  select v_marcacao, sv.id, sv.nome, sv.categoria, sv.preco, sv.duracao_min
    from servicos sv
   where sv.id = any(p_servico_ids) and sv.ativo;

  return v_marcacao;
end $$;

revoke all on function public.criar_marcacao(text, text, timestamptz, uuid[], text) from public;
grant execute on function public.criar_marcacao(text, text, timestamptz, uuid[], text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- reordenar_servicos(ids) -> grava a nova ordem de uma categoria
-- ---------------------------------------------------------------------
create or replace function public.reordenar_servicos(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update servicos s
     set ordem = x.pos
    from (select unnest(p_ids) as id, generate_series(1, array_length(p_ids,1)) as pos) x
   where s.id = x.id;
end $$;

grant execute on function public.reordenar_servicos(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: a dona recebe as marcações novas sem recarregar a página
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'marcacoes')
  then
    alter publication supabase_realtime add table public.marcacoes;
  end if;
end $$;
