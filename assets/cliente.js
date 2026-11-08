// =====================================================================
// Site público — escolha de serviços, calendário e marcação
// =====================================================================

const estado = {
  definicoes: null,
  servicos: [],
  categoria: 'senhoras',
  escolhidos: new Map(),   // id -> serviço
  mes: new Date(),
  diasLivres: new Set(),
  dia: null,
  hora: null,
};

const $ = (id) => document.getElementById(id);

const duracaoTotal = () =>
  [...estado.escolhidos.values()].reduce((t, s) => t + s.duracao_min, 0);
const precoTotal = () =>
  [...estado.escolhidos.values()].reduce((t, s) => t + Number(s.preco), 0);

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------
async function iniciar() {
  const [def, serv] = await Promise.all([
    sb.from('definicoes').select('*').eq('id', 1).maybeSingle(),
    sb.from('servicos').select('*').eq('ativo', true).order('ordem'),
  ]);

  if (serv.error) {
    $('listaServicos').innerHTML =
      '<div class="aviso aviso--erro">Não foi possível carregar os serviços. Verifique a ligação à internet e tente novamente.</div>';
    return;
  }

  estado.definicoes = def.data || {};
  estado.servicos = serv.data || [];

  if (estado.definicoes.nome_salao) {
    $('nomeSalao').textContent = estado.definicoes.nome_salao;
    document.title = `${estado.definicoes.nome_salao} — Marcações`;
  }

  desenharServicos();
  montarCabecalhoCal();
}

// ---------------------------------------------------------------------
// Lista de serviços
// ---------------------------------------------------------------------
function desenharServicos() {
  const cat = estado.categoria;
  $('notaTabela').textContent =
    (cat === 'senhoras' ? estado.definicoes.aviso_senhoras : estado.definicoes.aviso_senhores) || '';
  $('notaTabela').hidden = !$('notaTabela').textContent;

  const lista = estado.servicos.filter((s) => s.categoria === cat);
  if (!lista.length) {
    $('listaServicos').innerHTML = '<div class="vazio">Ainda não há serviços nesta tabela.</div>';
    return;
  }

  $('listaServicos').innerHTML = lista.map((s) => `
    <button class="servico" type="button" data-id="${s.id}"
            aria-pressed="${estado.escolhidos.has(s.id)}">
      <span class="servico__caixa" aria-hidden="true">${estado.escolhidos.has(s.id) ? '✓' : ''}</span>
      <span class="servico__corpo">
        <span class="servico__nome">${escaparHtml(s.nome)}</span>
        <span class="servico__dur">${duracao(s.duracao_min)}</span>
      </span>
      <span class="servico__preco">${euros(s.preco)}</span>
    </button>`).join('');
}

function alternarServico(id) {
  if (estado.escolhidos.has(id)) {
    estado.escolhidos.delete(id);
  } else {
    const s = estado.servicos.find((x) => x.id === id);
    if (s) estado.escolhidos.set(id, s);
  }
  desenharServicos();
  atualizarCarrinho();
}

function atualizarCarrinho() {
  const n = estado.escolhidos.size;
  $('carrinho').classList.toggle('aberto', n > 0);
  $('carrinhoTotal').textContent = euros(precoTotal());
  $('carrinhoDetalhe').textContent =
    `${n} ${n === 1 ? 'serviço' : 'serviços'} · ${duracao(duracaoTotal())}`;
}

// ---------------------------------------------------------------------
// Calendário
// ---------------------------------------------------------------------
function montarCabecalhoCal() {
  $('calCabecalho').innerHTML =
    DIAS_CURTOS.map((d) => `<div class="cal__cab">${d}</div>`).join('');
}

async function carregarMes() {
  const ano = estado.mes.getFullYear();
  const mes = estado.mes.getMonth() + 1;

  $('mesAtual').textContent = `${MESES[mes - 1]} ${ano}`;
  $('calDias').innerHTML = '<div class="carregar" style="grid-column:1/-1">A procurar vagas…</div>';

  const hoje = new Date();
  $('mesAnterior').disabled =
    ano < hoje.getFullYear() || (ano === hoje.getFullYear() && mes - 1 <= hoje.getMonth());

  const { data, error } = await sb.rpc('dias_com_vagas', {
    p_ano: ano, p_mes: mes, p_duracao: duracaoTotal(),
  });

  estado.diasLivres = new Set(error ? [] : (data || []).map((r) => r.dia));
  desenharDias();
}

function desenharDias() {
  const ano = estado.mes.getFullYear();
  const mes = estado.mes.getMonth();
  const primeiro = new Date(ano, mes, 1).getDay();
  const total = new Date(ano, mes + 1, 0).getDate();
  const hojeIso = isoData(new Date());

  let html = '';
  for (let i = 0; i < primeiro; i++) html += '<div></div>';

  for (let d = 1; d <= total; d++) {
    const iso = isoData(new Date(ano, mes, d));
    const livre = estado.diasLivres.has(iso);
    const classes = ['cal__dia'];
    if (livre) classes.push('cal__dia--livre');
    if (iso === hojeIso) classes.push('cal__dia--hoje');
    if (iso === estado.dia) classes.push('cal__dia--escolhido');
    html += `<button class="${classes.join(' ')}" data-dia="${iso}" ${livre ? '' : 'disabled'}>${d}</button>`;
  }
  $('calDias').innerHTML = html;
}

// ---------------------------------------------------------------------
// Horas
// ---------------------------------------------------------------------
async function carregarHoras(dia) {
  estado.dia = dia;
  estado.hora = null;
  desenharDias();
  $('cartaoForm').hidden = true;
  $('cartaoHoras').hidden = false;
  $('listaHoras').innerHTML = '<div class="carregar">A procurar horários…</div>';

  const { data, error } = await sb.rpc('slots_disponiveis', {
    p_data: dia, p_duracao: duracaoTotal(),
  });

  if (error || !data || !data.length) {
    $('listaHoras').innerHTML = '<div class="vazio">Já não há horários livres neste dia.</div>';
    return;
  }

  const manha = [], tarde = [];
  data.forEach((r) => {
    const h = horaDe(r.inicio);
    (parseInt(h, 10) < 13 ? manha : tarde).push({ iso: r.inicio, h });
  });

  const bloco = (titulo, arr) => !arr.length ? '' :
    `<div class="horas__grupo">${titulo}</div><div class="horas">` +
    arr.map((s) => `<button class="hora" data-hora="${s.iso}" aria-pressed="false">${s.h}</button>`).join('') +
    '</div>';

  $('listaHoras').innerHTML = bloco('Manhã', manha) + bloco('Tarde', tarde);
  $('cartaoHoras').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function escolherHora(iso) {
  estado.hora = iso;
  document.querySelectorAll('.hora').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.hora === iso)));

  const d = new Date(iso);
  $('resumoFinal').innerHTML =
    [...estado.escolhidos.values()].map((s) =>
      `<div class="resumo__linha"><span>${escaparHtml(s.nome)}</span><span>${euros(s.preco)}</span></div>`
    ).join('') +
    `<div class="resumo__linha" style="color:var(--tinta-ténue)">
       <span>${dataLonga(d)} às ${horaDe(iso)}</span><span>${duracao(duracaoTotal())}</span></div>
     <div class="resumo__total"><span>Total</span><span>${euros(precoTotal())}</span></div>`;

  $('cartaoForm').hidden = false;
  $('cartaoForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------------------------------------------------------------------
// Submeter
// ---------------------------------------------------------------------
async function submeter(ev) {
  ev.preventDefault();
  const btn = $('btnConfirmar');
  const nome = $('campoNome').value.trim();
  const tel = ($('campoInd').value + $('campoTel').value).trim();

  aviso($('avisoForm'), '');

  if (nome.length < 2) return aviso($('avisoForm'), 'Indique o seu nome.');
  if (tel.replace(/\D/g, '').length < 9) return aviso($('avisoForm'), 'Indique um número de telemóvel válido.');
  if (!estado.hora) return aviso($('avisoForm'), 'Escolha uma hora.');

  btn.disabled = true;
  btn.textContent = 'A enviar…';

  const { error } = await sb.rpc('criar_marcacao', {
    p_nome: nome,
    p_telemovel: normalizarTelemovel(tel),
    p_inicio: estado.hora,
    p_servico_ids: [...estado.escolhidos.keys()],
    p_nota: $('campoNota').value.trim(),
  });

  btn.disabled = false;
  btn.textContent = 'Confirmar marcação';

  if (error) {
    aviso($('avisoForm'), error.message || 'Não foi possível concluir. Tente novamente.');
    if (/deixou de estar|disponível/i.test(error.message || '')) carregarHoras(estado.dia);
    return;
  }

  $('resumoFeito').innerHTML = $('resumoFinal').innerHTML;
  $('etapaHorario').hidden = true;
  $('etapaFeito').hidden = false;
  $('carrinho').classList.remove('aberto');
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------
document.querySelectorAll('.sep').forEach((b) => b.addEventListener('click', () => {
  estado.categoria = b.dataset.cat;
  document.querySelectorAll('.sep').forEach((x) =>
    x.setAttribute('aria-selected', String(x === b)));
  desenharServicos();
}));

$('listaServicos').addEventListener('click', (e) => {
  const b = e.target.closest('.servico');
  if (b) alternarServico(b.dataset.id);
});

$('btnContinuar').addEventListener('click', () => {
  if (!estado.escolhidos.size) return;
  $('etapaServicos').hidden = true;
  $('etapaHorario').hidden = false;
  $('carrinho').classList.remove('aberto');
  const n = estado.escolhidos.size;
  $('resumoEscolha').textContent =
    `${n} ${n === 1 ? 'serviço' : 'serviços'} · ${duracao(duracaoTotal())} · ${euros(precoTotal())}`;
  estado.mes = new Date();
  estado.dia = null;
  $('cartaoHoras').hidden = true;
  $('cartaoForm').hidden = true;
  window.scrollTo({ top: 0 });
  carregarMes();
});

$('voltarServicos').addEventListener('click', () => {
  $('etapaHorario').hidden = true;
  $('etapaServicos').hidden = false;
  atualizarCarrinho();
  window.scrollTo({ top: 0 });
});

$('mesAnterior').addEventListener('click', () => {
  estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() - 1, 1);
  carregarMes();
});
$('mesSeguinte').addEventListener('click', () => {
  estado.mes = new Date(estado.mes.getFullYear(), estado.mes.getMonth() + 1, 1);
  carregarMes();
});

$('calDias').addEventListener('click', (e) => {
  const b = e.target.closest('.cal__dia');
  if (b && !b.disabled) carregarHoras(b.dataset.dia);
});

$('listaHoras').addEventListener('click', (e) => {
  const b = e.target.closest('.hora');
  if (b) escolherHora(b.dataset.hora);
});

$('formMarcacao').addEventListener('submit', submeter);

$('novaMarcacao').addEventListener('click', () => location.reload());

iniciar();
