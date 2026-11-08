// =====================================================================
// Funções partilhadas pelo site público e pelo painel
// =====================================================================

const sb = window.supabase.createClient(
  window.CONFIG.SUPABASE_URL,
  window.CONFIG.SUPABASE_ANON_KEY
);

const TZ = window.CONFIG.TZ || 'Europe/Lisbon';

const DIAS_CURTOS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
                     'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const euros = (v) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(v) || 0);

const duracao = (min) => {
  const m = Number(min) || 0;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
};

const horaDe = (iso) =>
  new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

const dataDe = (iso) =>
  new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', timeZone: TZ });

const dataLonga = (d) => `${DIAS_LONGOS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;

const isoData = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Normaliza um número português para o formato +3519XXXXXXXX
function normalizarTelemovel(valor) {
  const limpo = String(valor || '').replace(/[^0-9+]/g, '');
  if (limpo.startsWith('+')) return limpo;
  const digitos = limpo.replace(/\D/g, '');
  if (digitos.length === 9) return '+351' + digitos;
  if (digitos.startsWith('351')) return '+' + digitos;
  return '+' + digitos;
}

// Link oficial wa.me — abre o WhatsApp com a mensagem já escrita.
// Não envia nada sozinho: é preciso tocar em enviar.
function linkWhatsApp(telemovel, mensagem) {
  const num = normalizarTelemovel(telemovel).replace(/\D/g, '');
  return `https://wa.me/${num}?text=${encodeURIComponent(mensagem)}`;
}

function escaparHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function aviso(el, texto, tipo = 'erro') {
  if (!el) return;
  el.className = `aviso aviso--${tipo}`;
  el.textContent = texto;
  el.hidden = !texto;
}
