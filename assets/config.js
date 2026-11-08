// =====================================================================
// Estética Anabela — ligação ao Supabase
//
// Substitua os dois valores abaixo pelos do SEU projeto Supabase:
//   Dashboard > Project Settings > API
//     URL          -> SUPABASE_URL
//     anon public  -> SUPABASE_ANON_KEY
//
// A chave "anon" é PÚBLICA por natureza e pode ficar aqui sem problema.
// Quem protege os dados são as políticas RLS da base de dados, não a chave.
// NUNCA coloque aqui a chave "service_role".
// =====================================================================

window.CONFIG = {
  SUPABASE_URL: 'https://COLOQUE-AQUI.supabase.co',
  SUPABASE_ANON_KEY: 'COLOQUE-AQUI-A-CHAVE-ANON',
  TZ: 'Europe/Lisbon',
};
