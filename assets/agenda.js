// =====================================================================
// Painel da dona — agenda (dia, semana e mês)
// =====================================================================

const agenda = {
  modo: 'semana',
  ref: new Date(),
  marcacoes: [],
  bloqueios: [],
  horarios: [],
  pedido: 0,
  irParaHoje: true,
};

const HORA_PX = 58;
const DIAS_CAB = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const somaDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const chaveDia = (v) => new Date(v).toLocaleDateString('en-CA', { timeZone: TZ });
const minutosDe = (iso) => {
  const [h, m] = horaDe(iso).split(':').map(Number);
  return (h % 24) * 60 + m;
};
const minutosHora = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const inicioSemana = (d) => somaDias(d, -((d.getDay() + 6) % 7));

function diasVisiveis() {
  const r = agenda.ref;
  if (agenda.modo === 'dia') return [new Date(r.getFullYear(), r.getMonth(), r.getDate())];
  if (agenda.modo === 'semana') {
    const ini = inicioSemana(r);
    return Array.from({ length: 7 }, (_, i) => somaDias(ini, i));
  }
  const ini = inicioSemana(new Date(r.getFullYear(), r.getMonth(), 1));
  const fim = inicioSemana(new Date(r.getFullYear(), r.getMonth() + 1, 0));
  const total = Math.round((fim - ini) / 864e5 / 7) + 1;
  return Array.from({ length: total * 7 }, (_, i) => somaDias(ini, i));
}

function tituloAgenda(dias) {
  const a = dias[0];
  const b = dias[dias.length - 1];
  if (agenda.modo === 'dia') {
    return `${maiuscula(DIAS_LONGOS[a.getDay()].split('-')[0])}, ${a.getDate()} ${MESES_CURTOS[a.getMonth()]}`;
  }
  if (agenda.modo === 'mes') return `${maiuscula(MESES[agenda.ref.getMonth()])} ${agenda.ref.getFullYear()}`;
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${MESES_CURTOS[b.getMonth()]}`
    : `${a.getDate()} ${MESES_CURTOS[a.getMonth()]} – ${b.getDate()} ${MESES_CURTOS[b.getMonth()]}`;
}

// ---------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------
async function carregarAgenda() {
  const dias = diasVisiveis();
  const pedido = ++agenda.pedido;
  const ini = somaDias(dias[0], -1).toISOString();
  const fim = somaDias(dias[dias.length - 1], 2).toISOString();

  const [marc, bloq, hor] = await Promise.all([
    sb.from('marcacoes')
      .select('*, marcacao_servicos(nome, preco, duracao_min)')
      .in('estado', ['pendente', 'confirmada'])
      .gte('inicio', ini).lt('inicio', fim).order('inicio'),
    sb.from('bloqueios').select('*').lt('inicio', fim).gt('fim', ini),
    sb.from('horarios').select('*'),
  ]);
  if (pedido !== agenda.pedido) return;

  const erro = marc.error || bloq.error || hor.error;
  if (erro) {
    $('agCorpo').innerHTML = `<div class="aviso aviso--erro">${escaparHtml(erro.message)}</div>`;
    return;
  }

  agenda.marcacoes = marc.data || [];
  agenda.bloqueios = bloq.data || [];
  agenda.horarios = hor.data || [];
  desenharAgenda(dias);
}

// ---------------------------------------------------------------------
// Horário de cada dia
// ---------------------------------------------------------------------
function intervalosAbertos(d) {
  const h = agenda.horarios.find((x) => x.dia_semana === d.getDay());
  if (!h || h.fechado) return [];
  return [[h.manha_inicio, h.manha_fim], [h.tarde_inicio, h.tarde_fim]]
    .filter(([a, b]) => a && b)
    .map(([a, b]) => [minutosHora(a), minutosHora(b)]);
}

function bloqueiosDoDia(d) {
  const k = isoData(d);
  return agenda.bloqueios
    .filter((b) => chaveDia(b.inicio) <= k && chaveDia(b.fim) >= k)
    .map((b) => ({
      ini: chaveDia(b.inicio) < k ? 0 : minutosDe(b.inicio),
      fim: chaveDia(b.fim) > k ? 1440 : minutosDe(b.fim),
      motivo: b.motivo || '',
    }))
    .filter((b) => b.ini < b.fim);
}

function diaFechado(d) {
  const abertos = intervalosAbertos(d);
  const bloq = bloqueiosDoDia(d);
  return abertos.every(([a, b]) => bloq.some((x) => x.ini <= a && x.fim >= b));
}

function limitesHoras(dias) {
  let ini = Infinity;
  let fim = -Infinity;
  dias.forEach((d) => intervalosAbertos(d).forEach(([a, b]) => {
    ini = Math.min(ini, a);
    fim = Math.max(fim, b);
  }));
  const chaves = new Set(dias.map(isoData));
  agenda.marcacoes.filter((m) => chaves.has(chaveDia(m.inicio))).forEach((m) => {
    const a = minutosDe(m.inicio);
    ini = Math.min(ini, a);
    fim = Math.max(fim, a + m.duracao_min);
  });
  if (ini === Infinity) { ini = 8 * 60; fim = 19 * 60; }
  return [Math.floor(ini / 60) * 60, Math.min(1440, Math.ceil(fim / 60) * 60)];
}

// Marcações sobrepostas ficam lado a lado na coluna.
function distribuir(ms) {
  const res = [];
  let grupo = [];
  let fimGrupo = 0;
  const fechar = () => {
    const fins = [];
    grupo.forEach((x) => {
      let p = fins.findIndex((f) => f <= x.ini);
      if (p < 0) { p = fins.length; fins.push(0); }
      fins[p] = x.fim;
      x.pista = p;
    });
    grupo.forEach((x) => { x.pistas = fins.length; res.push(x); });
    grupo = [];
    fimGrupo = 0;
  };
  ms.forEach((m) => {
    const ini = minutosDe(m.inicio);
    const fim = ini + m.duracao_min;
    if (grupo.length && ini >= fimGrupo) fechar();
    grupo.push({ m, ini, fim });
    fimGrupo = Math.max(fimGrupo, fim);
  });
  if (grupo.length) fechar();
  return res;
}

// ---------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------
function desenharAgenda(dias) {
  $('agTitulo').textContent = tituloAgenda(dias);
  const anterior = $('agCorpo').querySelector('.ag__rolo');
  const posicao = anterior ? [anterior.scrollLeft, anterior.scrollTop] : [0, 0];

  $('agCorpo').innerHTML = agenda.modo === 'mes' ? htmlMes(dias) : htmlGrelha(dias);

  const rolo = $('agCorpo').querySelector('.ag__rolo');
  if (!rolo) return;
  if (agenda.irParaHoje) {
    const hoje = rolo.querySelector('.ag__cab--hoje');
    rolo.scrollLeft = hoje ? hoje.offsetLeft - 52 : 0;
    rolo.scrollTop = 0;
    agenda.irParaHoje = false;
  } else {
    [rolo.scrollLeft, rolo.scrollTop] = posicao;
  }
}

function porDia(d) {
  const k = isoData(d);
  return agenda.marcacoes.filter((m) => chaveDia(m.inicio) === k);
}

function htmlGrelha(dias) {
  const [ini, fim] = limitesHoras(dias);
  const px = (min) => (min / 60) * HORA_PX;
  const altura = px(fim - ini);
  const hojeK = isoData(new Date());

  let horas = '';
  for (let h = ini / 60; h < fim / 60; h++) {
    horas += `<div class="ag__hora" style="top:${px(h * 60 - ini)}px">${String(h).padStart(2, '0')}:00</div>`;
  }

  const cabs = dias.map((d) => `
    <button class="ag__cab ${isoData(d) === hojeK ? 'ag__cab--hoje' : ''}" data-dia="${isoData(d)}">
      <span>${DIAS_CAB[d.getDay()]}</span><strong>${d.getDate()}</strong>
    </button>`).join('');

  const faixa = (a, b, texto) => {
    const de = Math.max(a, ini);
    const ate = Math.min(b, fim);
    if (de >= ate) return '';
    return `<div class="ag__fechado" style="top:${px(de - ini)}px;height:${px(ate - de)}px">${
      texto ? `<span>${escaparHtml(texto)}</span>` : ''}</div>`;
  };

  const colunas = dias.map((d) => {
    const abertos = intervalosAbertos(d).sort((a, b) => a[0] - b[0]);
    let fundo = '';
    if (!abertos.length) {
      fundo = faixa(ini, fim, 'Fechado');
    } else {
      let cursor = ini;
      abertos.forEach(([a, b]) => { fundo += faixa(cursor, a, ''); cursor = b; });
      fundo += faixa(cursor, fim, '');
    }
    fundo += bloqueiosDoDia(d).map((b) => faixa(b.ini, b.fim, b.motivo || 'Fechado')).join('');

    const eventos = distribuir(porDia(d)).map(({ m, ini: a, fim: b, pista, pistas }) => {
      const servicos = (m.marcacao_servicos || []).map((s) => s.nome).join(' · ');
      const icone = m.estado === 'confirmada' ? '✓' : '⏳';
      return `
        <button class="ag__ev ag__ev--${m.estado}" data-marc="${m.id}"
          style="top:${px(a - ini)}px;height:${Math.max(px(b - a) - 2, 26)}px;left:calc(${(pista / pistas) * 100}% + 1px);width:calc(${100 / pistas}% - 3px)"
          aria-label="${escaparHtml(`${m.nome}, ${horaDe(m.inicio)}, ${m.estado}`)}">
          <span class="ag__ev-nome"><span>${escaparHtml(m.nome)}</span><i aria-hidden="true">${icone}</i></span>
          <span class="ag__ev-serv">${escaparHtml(servicos)}</span>
        </button>`;
    }).join('');

    return `<div class="ag__col" style="height:${altura}px">${fundo}${eventos}</div>`;
  }).join('');

  return `
    <div class="ag__rolo">
      <div class="ag__grelha" style="--dias:${dias.length};--larg:${dias.length > 1 ? '92px' : '0px'};--hora:${HORA_PX}px">
        <div class="ag__canto"></div>${cabs}
        <div class="ag__horas" style="height:${altura}px">${horas}</div>${colunas}
      </div>
    </div>`;
}

function htmlMes(dias) {
  const hojeK = isoData(new Date());
  const mes = agenda.ref.getMonth();
  const cab = [1, 2, 3, 4, 5, 6, 0].map((d) => `<div class="ag__mes-cab">${DIAS_CAB[d]}</div>`).join('');

  const celulas = dias.map((d) => {
    const ms = porDia(d);
    const classes = ['ag__cel'];
    if (d.getMonth() !== mes) classes.push('ag__cel--fora');
    if (isoData(d) === hojeK) classes.push('ag__cel--hoje');
    if (diaFechado(d)) classes.push('ag__cel--fechado');
    const chips = ms.slice(0, 3).map((m) =>
      `<span class="ag__chip ag__ev--${m.estado}">${escaparHtml(m.nome)}</span>`).join('');
    const mais = ms.length > 3 ? `<span class="ag__mais">+${ms.length - 3}</span>` : '';
    return `<button class="${classes.join(' ')}" data-dia="${isoData(d)}"
      aria-label="${d.getDate()} de ${MESES[d.getMonth()]}, ${ms.length} ${ms.length === 1 ? 'marcação' : 'marcações'}">
      <strong>${d.getDate()}</strong>${chips}${mais}</button>`;
  }).join('');

  return `<div class="ag__mes">${cab}${celulas}</div>`;
}

// ---------------------------------------------------------------------
// Detalhe da marcação
// ---------------------------------------------------------------------
function dataHoraCurta(iso) {
  return `${dataDe(iso)} ${horaDe(iso)}`;
}

function abrirFolha(m) {
  const servicos = (m.marcacao_servicos || []).map((s) => s.nome).join(' · ') || '—';
  const dia = maiuscula(new Date(m.inicio)
    .toLocaleDateString('pt-PT', { weekday: 'long', timeZone: TZ }).split('-')[0]);
  const confirmada = m.estado === 'confirmada';

  $('folhaConteudo').innerHTML = `
    <h2 class="folha__titulo" id="folhaTitulo">${escaparHtml(servicos)}</h2>
    <div class="folha__passos">
      <div class="passo passo--feito"><i></i><strong>Solicitado</strong><span>${dataHoraCurta(m.criado_em)}</span></div>
      <div class="passo ${confirmada ? 'passo--feito' : 'passo--espera'}"><i></i><strong>${confirmada ? 'Confirmado' : 'Por confirmar'}</strong><span>${confirmada ? dataHoraCurta(m.atualizado_em) : '—'}</span></div>
    </div>
    <div class="folha__info">
      <div><span aria-hidden="true">👤</span><strong>${escaparHtml(m.nome)}</strong> · <a href="tel:${escaparHtml(m.telemovel)}">${escaparHtml(m.telemovel)}</a></div>
      <div><span aria-hidden="true">📅</span>${dia}, ${dataDe(m.inicio)}, ${horaDe(m.inicio)} – ${horaDe(m.fim)}</div>
      <div><span aria-hidden="true">🕒</span>${duracao(m.duracao_min)}</div>
      <div><span aria-hidden="true">💶</span><strong>${euros(m.total)}</strong></div>
      ${m.nota ? `<div><span aria-hidden="true">📝</span><em>${escaparHtml(m.nota)}</em></div>` : ''}
    </div>
    <div class="marcacao__acoes">${acoesMarcacao(m)}</div>`;

  $('folhaMarc').hidden = false;
  $('folhaFechar').focus();
}

function fecharFolha() {
  $('folhaMarc').hidden = true;
}

// ---------------------------------------------------------------------
// Controlos
// ---------------------------------------------------------------------
function mostrarVistaMarc(vista) {
  document.querySelectorAll('[data-vista]').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.vista === vista)));
  $('vistaCalendario').hidden = vista !== 'calendario';
  $('vistaGeral').hidden = vista !== 'geral';
}

function mudarModo(modo) {
  agenda.modo = modo;
  agenda.irParaHoje = true;
  document.querySelectorAll('[data-modo]').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.modo === modo)));
  carregarAgenda();
}

function navegar(sentido) {
  const r = agenda.ref;
  if (agenda.modo === 'dia') agenda.ref = somaDias(r, sentido);
  else if (agenda.modo === 'semana') agenda.ref = somaDias(r, sentido * 7);
  else agenda.ref = new Date(r.getFullYear(), r.getMonth() + sentido, 1);
  agenda.irParaHoje = true;
  carregarAgenda();
}

document.querySelectorAll('[data-vista]').forEach((b) =>
  b.addEventListener('click', () => mostrarVistaMarc(b.dataset.vista)));
document.querySelectorAll('[data-modo]').forEach((b) =>
  b.addEventListener('click', () => mudarModo(b.dataset.modo)));

$('agAnterior').addEventListener('click', () => navegar(-1));
$('agSeguinte').addEventListener('click', () => navegar(1));
$('agHoje').addEventListener('click', () => {
  agenda.ref = new Date();
  agenda.irParaHoje = true;
  carregarAgenda();
});

$('agCorpo').addEventListener('click', (e) => {
  const ev = e.target.closest('[data-marc]');
  if (ev) {
    const m = agenda.marcacoes.find((x) => x.id === ev.dataset.marc);
    if (m) abrirFolha(m);
    return;
  }
  const dia = e.target.closest('[data-dia]');
  if (dia) {
    const [a, m, d] = dia.dataset.dia.split('-').map(Number);
    agenda.ref = new Date(a, m - 1, d);
    mudarModo('dia');
  }
});

$('folhaFechar').addEventListener('click', fecharFolha);
$('folhaFundo').addEventListener('click', fecharFolha);
$('folhaConteudo').addEventListener('click', tratarAcaoMarcacao);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('folhaMarc').hidden) fecharFolha();
});
