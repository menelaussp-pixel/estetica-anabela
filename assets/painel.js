// =====================================================================
// Painel da dona
// =====================================================================

const $ = (id) => document.getElementById(id);

const app = {
  servicos: [],
  catServicos: 'senhoras',
  marcacoes: [],
  estadosAtivos: new Set(['confirmada']),
  horarios: [],
  definicoes: {},
  canal: null,
};

const TITULOS = {
  pgMarcacoes: 'Marcações', pgClientes: 'Clientes', pgServicos: 'Serviços',
  pgPainel: 'Painel', pgPerfil: 'Definições',
};

// ---------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------
// O Supabase exige um email em cada conta. A dona só vê um nome de utilizador;
// o email é construído a partir dele, num domínio reservado que não recebe correio.
const DOMINIO_INTERNO = 'painel.estetica-anabela.invalid';
const normalizarUtilizador = (u) => String(u || '').trim().toLowerCase();
const emailDoUtilizador = (u) => `${normalizarUtilizador(u)}@${DOMINIO_INTERNO}`;
const utilizadorDoEmail = (email) => String(email || '').split('@')[0];

$('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  aviso($('avisoLogin'), '');
  $('btnEntrar').disabled = true;
  $('btnEntrar').textContent = 'A entrar…';

  const { error } = await sb.auth.signInWithPassword({
    email: emailDoUtilizador($('loginUtilizador').value),
    password: $('loginPass').value,
  });

  $('btnEntrar').disabled = false;
  $('btnEntrar').textContent = 'Entrar';
  if (error) aviso($('avisoLogin'), 'Utilizador ou palavra-passe incorretos.');
});

$('btnGuardarAcesso').addEventListener('click', async () => {
  const el = $('avisoAcesso');
  const btn = $('btnGuardarAcesso');
  aviso(el, '');

  const utilizador = normalizarUtilizador($('acessoUtilizador').value);
  const atual = $('acessoAtual').value;
  const nova = $('acessoNova').value;

  if (!/^[a-z0-9._-]{3,40}$/.test(utilizador)) {
    aviso(el, 'O utilizador deve ter pelo menos 3 caracteres: letras sem acentos, números, ponto, hífen ou sublinhado.');
    return;
  }
  if (nova && nova.length < 8) {
    aviso(el, 'A nova palavra-passe deve ter pelo menos 8 caracteres.');
    return;
  }
  if (nova !== $('acessoRepetir').value) {
    aviso(el, 'As duas palavras-passe novas não coincidem.');
    return;
  }
  if (!atual) {
    aviso(el, 'Escreva a palavra-passe atual para guardar.');
    return;
  }
  if (nova && nova === atual) {
    aviso(el, 'A nova palavra-passe tem de ser diferente da atual.');
    return;
  }

  const { data } = await sb.auth.getSession();
  const emailAtual = data.session.user.email;
  const novoEmail = emailDoUtilizador(utilizador);
  const trocarUtilizador = novoEmail !== emailAtual;
  if (!trocarUtilizador && !nova) {
    aviso(el, 'Não há nada para alterar.', 'info');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'A guardar…';
  const { error: erroAtual } = await sb.auth.signInWithPassword({ email: emailAtual, password: atual });
  let error = null;
  if (!erroAtual && trocarUtilizador) {
    // O Supabase recusa o domínio interno em updateUser; a troca é feita na base de dados.
    ({ error } = await sb.rpc('alterar_utilizador', { p_email: novoEmail }));
    if (!error) await sb.auth.refreshSession();
  }
  if (!erroAtual && !error && nova) ({ error } = await sb.auth.updateUser({ password: nova }));
  btn.disabled = false;
  btn.textContent = 'Guardar acesso';

  if (erroAtual) {
    aviso(el, 'A palavra-passe atual está incorreta.');
  } else if (error) {
    aviso(el, 'Não foi possível guardar. Tente novamente.');
  } else {
    $('acessoUtilizador').value = utilizador;
    ['acessoNova', 'acessoRepetir', 'acessoAtual'].forEach((id) => { $(id).value = ''; });
    aviso(el, 'Acesso atualizado. Use estes dados da próxima vez que entrar.', 'ok');
  }
});

$('btnSair').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

sb.auth.onAuthStateChange((_evt, sessao) => {
  const dentro = !!sessao;
  $('ecraLogin').hidden = dentro;
  $('ecraApp').hidden = !dentro;
  if (dentro) arrancar();
});

sb.auth.getSession().then(({ data }) => {
  const dentro = !!data.session;
  $('ecraLogin').hidden = dentro;
  $('ecraApp').hidden = !dentro;
  if (dentro) arrancar();
});

let jaArrancou = false;
async function arrancar() {
  if (jaArrancou) return;
  jaArrancou = true;

  $('linkPublico').value = location.href.replace(/painel\.html.*$/, '');
  const { data: dadosSessao } = await sb.auth.getSession();
  $('acessoUtilizador').value = utilizadorDoEmail(dadosSessao.session?.user?.email);

  await Promise.all([carregarDefinicoes(), carregarServicos(), carregarHorarios()]);
  await carregarMarcacoes();
  carregarBloqueios();
  ligarRealtime();
}

// ---------------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------------
document.querySelectorAll('.barra-baixo button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.barra-baixo button').forEach((x) => x.removeAttribute('aria-current'));
    b.setAttribute('aria-current', 'page');
    document.querySelectorAll('.pagina').forEach((p) => p.classList.remove('ativa'));
    $(b.dataset.pg).classList.add('ativa');
    $('tituloPagina').textContent = TITULOS[b.dataset.pg];
    window.scrollTo({ top: 0 });
    if (b.dataset.pg === 'pgClientes') carregarClientes();
    if (b.dataset.pg === 'pgPainel') carregarEstatisticas();
  });
});

$('sino').addEventListener('click', () => {
  document.querySelector('[data-pg="pgMarcacoes"]').click();
  mostrarVistaMarc('geral');
  app.estadosAtivos = new Set(['pendente']);
  $('periodo').value = 'futuro';
  sincronizarFiltros();
  carregarMarcacoes();
});

// ---------------------------------------------------------------------
// Tempo real — a marcação nova aparece sozinha
// ---------------------------------------------------------------------
function ligarRealtime() {
  if (app.canal) return;
  app.canal = sb.channel('marcacoes-painel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'marcacoes' }, (payload) => {
      carregarMarcacoes();
      if (payload.eventType === 'INSERT') {
        try { new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==').play(); } catch {}
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Nova marcação', {
            body: `${payload.new.nome} — ${dataDe(payload.new.inicio)} às ${horaDe(payload.new.inicio)}`,
          });
        }
      }
    })
    .subscribe();

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// ---------------------------------------------------------------------
// Marcações
// ---------------------------------------------------------------------
function intervaloPeriodo() {
  const agora = new Date();
  const d0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  switch ($('periodo').value) {
    case 'hoje':   return [d0, new Date(d0.getTime() + 864e5)];
    case 'semana': {
      const ini = new Date(d0); ini.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));
      return [ini, new Date(ini.getTime() + 7 * 864e5)];
    }
    case 'mes': return [new Date(agora.getFullYear(), agora.getMonth(), 1),
                        new Date(agora.getFullYear(), agora.getMonth() + 1, 1)];
    case 'passado': return [new Date(2000, 0, 1), agora];
    default:        return [agora, new Date(agora.getFullYear() + 2, 0, 1)];
  }
}

async function carregarMarcacoes() {
  const [ini, fim] = intervaloPeriodo();
  const { data, error } = await sb
    .from('marcacoes')
    .select('*, marcacao_servicos(nome, preco, duracao_min)')
    .gte('inicio', ini.toISOString())
    .lt('inicio', fim.toISOString())
    .order('inicio');

  if (error) {
    $('listaMarcacoes').innerHTML = `<div class="aviso aviso--erro">${escaparHtml(error.message)}</div>`;
    return;
  }

  app.marcacoes = data || [];
  desenharMarcacoes();
  atualizarSino();
  carregarAgenda();
}

async function atualizarSino() {
  const { count } = await sb.from('marcacoes')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendente')
    .gte('inicio', new Date().toISOString());
  $('sinoBolha').hidden = !count;
  $('sinoBolha').textContent = count || 0;
}

function desenharMarcacoes() {
  const procura = $('procuraMarc').value.trim().toLowerCase();

  ['pendente', 'confirmada', 'recusada'].forEach((e) => {
    $('c' + e[0].toUpperCase() + e.slice(1)).textContent =
      app.marcacoes.filter((m) => m.estado === e).length;
  });

  const lista = app.marcacoes.filter((m) =>
    (app.estadosAtivos.size === 0 || app.estadosAtivos.has(m.estado)) &&
    (!procura || m.nome.toLowerCase().includes(procura) || m.telemovel.includes(procura)));

  if (!lista.length) {
    $('listaMarcacoes').innerHTML = '<div class="vazio">Nenhuma marcação para estes filtros.</div>';
    return;
  }

  const porDia = {};
  lista.forEach((m) => {
    let k = new Date(m.inicio).toLocaleDateString('pt-PT', {
      weekday: 'long', day: '2-digit', month: 'long', timeZone: TZ });
    k = k.charAt(0).toUpperCase() + k.slice(1);   // só a primeira letra, não "10 De Novembro"
    (porDia[k] ||= []).push(m);
  });

  $('listaMarcacoes').innerHTML = Object.entries(porDia).map(([dia, ms]) => `
    <div class="dia-cab"><span style="font-family:var(--serif);font-size:20px;color:var(--tinta)">${escaparHtml(dia)}</span>
      <span>${ms.length} ${ms.length === 1 ? 'marcação' : 'marcações'}</span></div>
    ${ms.map(cartaoMarcacao).join('')}`).join('');
}

function acoesMarcacao(m) {
  const servicos = (m.marcacao_servicos || []).map((s) => s.nome).join(' · ') || '—';
  const msgConf = `Olá ${m.nome}! A sua marcação na Estética Anabela está confirmada para ${dataDe(m.inicio)} às ${horaDe(m.inicio)} (${servicos}). Até breve!`;
  const msgRec = `Olá ${m.nome}. Infelizmente não conseguimos aceitar a marcação de ${dataDe(m.inicio)} às ${horaDe(m.inicio)}. Pode escolher outro horário no nosso site. Obrigada!`;
  const msgLemb = `Olá ${m.nome}! Lembrete da sua marcação na Estética Anabela amanhã, ${dataDe(m.inicio)} às ${horaDe(m.inicio)}. Até já!`;

  let acoes = '';
  if (m.estado === 'pendente') {
    acoes = `
      <button class="btn btn--verde btn--pequeno" data-acao="confirmada" data-id="${m.id}">✓ Confirmar</button>
      <button class="btn btn--perigo btn--pequeno" data-acao="recusada" data-id="${m.id}">✕ Recusar</button>
      <a class="btn btn--fantasma btn--pequeno" target="_blank" rel="noopener"
         href="${linkWhatsApp(m.telemovel, msgConf)}">WhatsApp confirmar</a>
      <a class="btn btn--fantasma btn--pequeno" target="_blank" rel="noopener"
         href="${linkWhatsApp(m.telemovel, msgRec)}">WhatsApp recusar</a>`;
  } else if (m.estado === 'confirmada') {
    acoes = `
      <a class="btn btn--fantasma btn--pequeno" target="_blank" rel="noopener"
         href="${linkWhatsApp(m.telemovel, msgLemb)}">WhatsApp lembrete</a>
      <a class="btn btn--fantasma btn--pequeno" href="tel:${escaparHtml(m.telemovel)}">Ligar</a>
      <button class="btn btn--perigo btn--pequeno" data-acao="cancelada" data-id="${m.id}">Cancelar</button>`;
  } else {
    acoes = `<button class="btn btn--fantasma btn--pequeno" data-acao="pendente" data-id="${m.id}">Repor como pendente</button>`;
  }
  return acoes;
}

function cartaoMarcacao(m) {
  const servicos = (m.marcacao_servicos || []).map((s) => s.nome).join(' · ') || '—';
  const acoes = acoesMarcacao(m);

  return `
    <div class="marcacao">
      <div class="marcacao__topo">
        <div>
          <div class="marcacao__hora">${horaDe(m.inicio)}–${horaDe(m.fim)}</div>
          <div class="marcacao__dur">${duracao(m.duracao_min)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;font-size:17px">${euros(m.total)}</div>
          <span class="etiqueta etiqueta--${m.estado}">${m.estado}</span>
        </div>
      </div>
      <div style="margin-top:10px">
        <div class="marcacao__nome">${escaparHtml(m.nome)} · <a href="tel:${escaparHtml(m.telemovel)}">${escaparHtml(m.telemovel)}</a></div>
        <div class="marcacao__serv">${escaparHtml(servicos)}</div>
        ${m.nota ? `<div class="marcacao__serv" style="font-style:italic;margin-top:5px">“${escaparHtml(m.nota)}”</div>` : ''}
      </div>
      <div class="marcacao__acoes">${acoes}</div>
    </div>`;
}

async function tratarAcaoMarcacao(e) {
  const b = e.target.closest('button[data-acao]');
  if (!b) return;
  if (b.dataset.acao === 'cancelada' && !confirm('Cancelar esta marcação?')) return;
  b.disabled = true;
  const { error } = await sb.from('marcacoes').update({ estado: b.dataset.acao }).eq('id', b.dataset.id);
  if (error) {
    b.disabled = false;
    alert(error.message);
    return;
  }
  fecharFolha();
  carregarMarcacoes();
}

$('listaMarcacoes').addEventListener('click', tratarAcaoMarcacao);

$('periodo').addEventListener('change', carregarMarcacoes);
$('procuraMarc').addEventListener('input', desenharMarcacoes);

document.querySelectorAll('.filtro').forEach((b) => b.addEventListener('click', () => {
  const e = b.dataset.estado;
  app.estadosAtivos.has(e) ? app.estadosAtivos.delete(e) : app.estadosAtivos.add(e);
  sincronizarFiltros();
  desenharMarcacoes();
}));

function sincronizarFiltros() {
  document.querySelectorAll('.filtro').forEach((b) =>
    b.setAttribute('aria-pressed', String(app.estadosAtivos.has(b.dataset.estado))));
}

// ---------------------------------------------------------------------
// Serviços
// ---------------------------------------------------------------------
async function carregarServicos() {
  const { data } = await sb.from('servicos').select('*').order('categoria').order('ordem');
  app.servicos = data || [];
  desenharServicosAdmin();
}

function desenharServicosAdmin() {
  const lista = app.servicos.filter((s) => s.categoria === app.catServicos);
  if (!lista.length) {
    $('listaServicosAdmin').innerHTML = '<div class="vazio">Ainda não há serviços nesta tabela.</div>';
    return;
  }

  $('listaServicosAdmin').innerHTML = lista.map((s, i) => `
    <div class="linha-serv ${s.ativo ? '' : 'linha-serv--inativo'}" draggable="true" data-id="${s.id}">
      <span class="pega" aria-hidden="true">⠿</span>
      <span class="setas">
        <button data-mover="cima" data-id="${s.id}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">▲</button>
        <button data-mover="baixo" data-id="${s.id}" ${i === lista.length - 1 ? 'disabled' : ''} aria-label="Descer">▼</button>
      </span>
      <span class="linha-serv__corpo">
        <span class="linha-serv__nome">${escaparHtml(s.nome)}</span>
        <span class="linha-serv__meta">${euros(s.preco)} · ${duracao(s.duracao_min)}${s.ativo ? '' : ' · desativado'}</span>
      </span>
      <button class="btn-icone" data-editar="${s.id}" title="Editar">✎</button>
      <button class="btn-icone" data-ativar="${s.id}" title="Ativar/desativar">${s.ativo ? '👁' : '🚫'}</button>
      <button class="btn-icone btn-icone--perigo" data-apagar="${s.id}" title="Remover">🗑</button>
    </div>`).join('');
}

document.querySelectorAll('#pgServicos .sep').forEach((b) => b.addEventListener('click', () => {
  app.catServicos = b.dataset.cat;
  document.querySelectorAll('#pgServicos .sep').forEach((x) =>
    x.setAttribute('aria-selected', String(x === b)));
  desenharServicosAdmin();
}));

$('btnAdicionarServico').addEventListener('click', async () => {
  const nome = $('novoNome').value.trim();
  if (!nome) return alert('Indique o nome do serviço.');
  const ordem = Math.max(0, ...app.servicos
    .filter((s) => s.categoria === app.catServicos).map((s) => s.ordem)) + 1;

  const { error } = await sb.from('servicos').insert({
    categoria: app.catServicos, nome,
    preco: Number($('novoPreco').value) || 0,
    duracao_min: Number($('novoDur').value) || 30,
    ordem,
  });
  if (error) return alert(error.message);
  $('novoNome').value = ''; $('novoPreco').value = '0'; $('novoDur').value = '30';
  carregarServicos();
});

$('listaServicosAdmin').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.dataset.editar) {
    const s = app.servicos.find((x) => x.id === btn.dataset.editar);
    const nome = prompt('Nome do serviço:', s.nome);
    if (nome === null) return;
    const preco = prompt('Preço em euros:', s.preco);
    if (preco === null) return;
    const dur = prompt('Duração em minutos:', s.duracao_min);
    if (dur === null) return;
    await sb.from('servicos').update({
      nome: nome.trim(), preco: Number(preco) || 0, duracao_min: Number(dur) || 30,
    }).eq('id', s.id);
    return carregarServicos();
  }

  if (btn.dataset.ativar) {
    const s = app.servicos.find((x) => x.id === btn.dataset.ativar);
    await sb.from('servicos').update({ ativo: !s.ativo }).eq('id', s.id);
    return carregarServicos();
  }

  if (btn.dataset.apagar) {
    const s = app.servicos.find((x) => x.id === btn.dataset.apagar);
    if (!confirm(`Remover “${s.nome}”? As marcações antigas mantêm o registo.`)) return;
    await sb.from('servicos').delete().eq('id', s.id);
    return carregarServicos();
  }

  if (btn.dataset.mover) {
    const lista = app.servicos.filter((x) => x.categoria === app.catServicos);
    const i = lista.findIndex((x) => x.id === btn.dataset.id);
    const j = btn.dataset.mover === 'cima' ? i - 1 : i + 1;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    await gravarOrdem(lista);
  }
});

async function gravarOrdem(lista) {
  await sb.rpc('reordenar_servicos', { p_ids: lista.map((s) => s.id) });
  carregarServicos();
}

// arrastar e largar
let aArrastar = null;
$('listaServicosAdmin').addEventListener('dragstart', (e) => {
  const l = e.target.closest('.linha-serv');
  if (!l) return;
  aArrastar = l;
  l.classList.add('a-arrastar');
  e.dataTransfer.effectAllowed = 'move';
});
$('listaServicosAdmin').addEventListener('dragover', (e) => {
  e.preventDefault();
  const l = e.target.closest('.linha-serv');
  document.querySelectorAll('.linha-serv').forEach((x) => x.classList.remove('alvo'));
  if (l && l !== aArrastar) l.classList.add('alvo');
});
$('listaServicosAdmin').addEventListener('drop', async (e) => {
  e.preventDefault();
  const alvo = e.target.closest('.linha-serv');
  document.querySelectorAll('.linha-serv').forEach((x) => x.classList.remove('alvo', 'a-arrastar'));
  if (!alvo || !aArrastar || alvo === aArrastar) return;

  const lista = app.servicos.filter((s) => s.categoria === app.catServicos);
  const de = lista.findIndex((s) => s.id === aArrastar.dataset.id);
  const para = lista.findIndex((s) => s.id === alvo.dataset.id);
  lista.splice(para, 0, lista.splice(de, 1)[0]);
  aArrastar = null;
  await gravarOrdem(lista);
});
$('listaServicosAdmin').addEventListener('dragend', () => {
  document.querySelectorAll('.linha-serv').forEach((x) => x.classList.remove('alvo', 'a-arrastar'));
});

// ---------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------
async function carregarClientes() {
  const p = $('procuraCliente').value.trim();
  let q = sb.from('clientes').select('*').order('nome').limit(300);
  if (p) q = q.or(`nome.ilike.%${p}%,telemovel.ilike.%${p}%`);
  const { data } = await q;

  if (!data || !data.length) {
    $('listaClientes').innerHTML = '<div class="vazio">Ainda não há clientes registados.</div>';
    return;
  }

  $('listaClientes').innerHTML = data.map((c) => `
    <div class="cliente">
      <div>
        <div style="font-weight:600">${escaparHtml(c.nome)}</div>
        <div style="font-size:13.5px;color:var(--tinta-ténue)">${escaparHtml(c.telemovel)}</div>
      </div>
      <div style="display:flex;gap:6px">
        <a class="btn btn--fantasma btn--pequeno" href="tel:${escaparHtml(c.telemovel)}">Ligar</a>
        <a class="btn btn--fantasma btn--pequeno" target="_blank" rel="noopener"
           href="${linkWhatsApp(c.telemovel, 'Olá ' + c.nome + '!')}">WhatsApp</a>
      </div>
    </div>`).join('');
}
$('procuraCliente').addEventListener('input', () => {
  clearTimeout(window._tc);
  window._tc = setTimeout(carregarClientes, 250);
});

// ---------------------------------------------------------------------
// Estatísticas
// ---------------------------------------------------------------------
async function carregarEstatisticas() {
  const agora = new Date();
  const ini = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 1).toISOString();

  const [mes, pend, cli, hist] = await Promise.all([
    sb.from('marcacoes').select('total').eq('estado', 'confirmada').gte('inicio', ini).lt('inicio', fim),
    sb.from('marcacoes').select('id', { count: 'exact', head: true }).eq('estado', 'pendente'),
    sb.from('clientes').select('id', { count: 'exact', head: true }),
    sb.from('marcacao_servicos').select('nome').limit(2000),
  ]);

  const linhas = mes.data || [];
  $('estMarc').textContent = linhas.length;
  $('estFat').textContent = euros(linhas.reduce((t, m) => t + Number(m.total), 0));
  $('estPend').textContent = pend.count ?? 0;
  $('estClientes').textContent = cli.count ?? 0;

  const contagem = {};
  (hist.data || []).forEach((r) => { contagem[r.nome] = (contagem[r.nome] || 0) + 1; });
  const top = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 8);

  $('topServicos').innerHTML = top.length
    ? top.map(([n, c]) => `<div class="resumo__linha"><span>${escaparHtml(n)}</span><strong>${c}</strong></div>`).join('')
    : '<div class="vazio" style="padding:18px">Ainda sem dados.</div>';
}

// ---------------------------------------------------------------------
// Definições e horário
// ---------------------------------------------------------------------
async function carregarDefinicoes() {
  const { data } = await sb.from('definicoes').select('*').eq('id', 1).maybeSingle();
  app.definicoes = data || {};
  $('avisoS1').value = app.definicoes.aviso_senhoras || '';
  $('avisoS2').value = app.definicoes.aviso_senhores || '';
  $('defNome').value = app.definicoes.nome_salao || '';
  $('defIntervalo').value = app.definicoes.intervalo_min ?? 15;
  $('defAntec').value = app.definicoes.antecedencia_min ?? 60;
}

$('btnGuardarDef').addEventListener('click', async () => {
  const { error } = await sb.from('definicoes').update({
    aviso_senhoras: $('avisoS1').value.trim(),
    aviso_senhores: $('avisoS2').value.trim(),
    nome_salao: $('defNome').value.trim() || 'Estética Anabela',
    intervalo_min: Number($('defIntervalo').value) || 15,
    antecedencia_min: Number($('defAntec').value) || 0,
    atualizado_em: new Date().toISOString(),
  }).eq('id', 1);
  alert(error ? error.message : 'Guardado.');
});

async function carregarHorarios() {
  const { data } = await sb.from('horarios').select('*').order('dia_semana');
  app.horarios = data || [];
  const ordem = [1, 2, 3, 4, 5, 6, 0];   // segunda → domingo

  $('listaHorarios').innerHTML = ordem.map((d) => {
    const h = app.horarios.find((x) => x.dia_semana === d) || { dia_semana: d, fechado: true };
    return `
      <div style="border-bottom:1px solid var(--borda);padding:10px 0" data-dia="${d}">
        <label style="display:flex;align-items:center;gap:9px;font-size:15px;text-transform:none;letter-spacing:0;color:var(--tinta);font-weight:600">
          <input type="checkbox" class="hAberto" ${h.fechado ? '' : 'checked'} style="width:auto">
          ${DIAS_LONGOS[d].charAt(0).toUpperCase() + DIAS_LONGOS[d].slice(1)}
        </label>
        <div class="hCampos" style="display:${h.fechado ? 'none' : 'grid'};grid-template-columns:1fr 1fr;gap:7px;margin-top:8px">
          <input type="time" class="hMi" value="${h.manha_inicio || '08:00'}" aria-label="Manhã abre">
          <input type="time" class="hMf" value="${h.manha_fim || '13:00'}" aria-label="Manhã fecha">
          <input type="time" class="hTi" value="${h.tarde_inicio || '15:00'}" aria-label="Tarde abre">
          <input type="time" class="hTf" value="${h.tarde_fim || '19:00'}" aria-label="Tarde fecha">
        </div>
      </div>`;
  }).join('');

  $('listaHorarios').querySelectorAll('.hAberto').forEach((c) =>
    c.addEventListener('change', () => {
      c.closest('[data-dia]').querySelector('.hCampos').style.display = c.checked ? 'grid' : 'none';
    }));
}

$('btnGuardarHorario').addEventListener('click', async () => {
  const linhas = [...$('listaHorarios').querySelectorAll('[data-dia]')].map((el) => {
    const aberto = el.querySelector('.hAberto').checked;
    return {
      dia_semana: Number(el.dataset.dia),
      fechado: !aberto,
      manha_inicio: aberto ? el.querySelector('.hMi').value || null : null,
      manha_fim:    aberto ? el.querySelector('.hMf').value || null : null,
      tarde_inicio: aberto ? el.querySelector('.hTi').value || null : null,
      tarde_fim:    aberto ? el.querySelector('.hTf').value || null : null,
    };
  });
  const { error } = await sb.from('horarios').upsert(linhas, { onConflict: 'dia_semana' });
  alert(error ? error.message : 'Horário guardado.');
});

// ---------------------------------------------------------------------
// Bloqueios
// ---------------------------------------------------------------------
async function carregarBloqueios() {
  const { data } = await sb.from('bloqueios').select('*')
    .gte('fim', new Date().toISOString()).order('inicio').limit(30);

  $('listaBloqueios').innerHTML = (data || []).length
    ? data.map((b) => `
        <div class="cliente">
          <div style="font-size:14px">
            ${dataDe(b.inicio)} ${horaDe(b.inicio)} → ${dataDe(b.fim)} ${horaDe(b.fim)}
            ${b.motivo ? `<div style="color:var(--tinta-ténue);font-size:13px">${escaparHtml(b.motivo)}</div>` : ''}
          </div>
          <button class="btn-icone btn-icone--perigo" data-bloq="${b.id}">🗑</button>
        </div>`).join('')
    : '<div style="font-size:13.5px;color:var(--tinta-ténue)">Nenhum período fechado.</div>';
}

$('btnBloquear').addEventListener('click', async () => {
  if (!$('bloqIni').value || !$('bloqFim').value) return alert('Indique as duas datas.');
  const { error } = await sb.from('bloqueios').insert({
    inicio: new Date($('bloqIni').value).toISOString(),
    fim: new Date($('bloqFim').value).toISOString(),
    motivo: $('bloqMotivo').value.trim(),
  });
  if (error) return alert(error.message);
  $('bloqIni').value = $('bloqFim').value = $('bloqMotivo').value = '';
  carregarBloqueios();
});

$('listaBloqueios').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-bloq]');
  if (!b || !confirm('Reabrir este período?')) return;
  await sb.from('bloqueios').delete().eq('id', b.dataset.bloq);
  carregarBloqueios();
});

$('btnCopiarLink').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('linkPublico').value);
    $('btnCopiarLink').textContent = 'Copiado ✓';
    setTimeout(() => { $('btnCopiarLink').textContent = 'Copiar link'; }, 1600);
  } catch { $('linkPublico').select(); }
});

sincronizarFiltros();
