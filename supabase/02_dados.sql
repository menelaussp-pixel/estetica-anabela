-- =====================================================================
-- Estética Anabela — dados iniciais
-- Correr DEPOIS de 01_schema.sql
--
-- ATENÇÃO: dois serviços estão marcados com <<< CONFIRMAR porque não
-- existiam na plataforma antiga e não foi indicado preço. Os valores
-- abaixo são um palpite — corrija-os no painel (Serviços > Editar).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Definições
-- ---------------------------------------------------------------------
insert into public.definicoes (id, nome_salao, aviso_senhoras, aviso_senhores)
values (
  1,
  'Estética Anabela',
  'O valor final corresponde à soma dos serviços escolhidos. Os preços e a duração podem sofrer alterações consoante o tempo necessário.',
  'O valor final corresponde à soma dos serviços escolhidos. Os preços e a duração podem sofrer alterações consoante o tempo necessário.'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Horário (0 = domingo ... 6 = sábado)
-- Segunda e domingo fechado; restantes 08:00-12:45 e 15:00-18:45
-- ---------------------------------------------------------------------
insert into public.horarios (dia_semana, fechado, manha_inicio, manha_fim, tarde_inicio, tarde_fim) values
  (0, true,  null,    null,    null,    null),
  (1, true,  null,    null,    null,    null),
  (2, false, '08:00', '13:00', '15:00', '19:00'),
  (3, false, '08:00', '13:00', '15:00', '19:00'),
  (4, false, '08:00', '13:00', '15:00', '19:00'),
  (5, false, '08:00', '13:00', '15:00', '19:00'),
  (6, false, '08:00', '13:00', '15:00', '19:00')
on conflict (dia_semana) do nothing;

-- ---------------------------------------------------------------------
-- SENHORAS
-- ---------------------------------------------------------------------
insert into public.servicos (categoria, nome, preco, duracao_min, ordem) values
  ('senhoras', 'Corpo Inteiro',                            35.00,  90,  1),
  ('senhoras', 'Perna Inteira',                            20.00,  60,  2),
  ('senhoras', 'Meia-Perna',                               12.00,  20,  3),
  ('senhoras', 'Permanente de Pestanas',                   20.00,  20,  4),
  ('senhoras', 'Pintura de Pestanas',                      10.00,  15,  5),
  ('senhoras', 'Alisamento de Sobrancelhas',               10.00,  10,  6),
  ('senhoras', 'Pintura de Sobrancelhas',                  10.00,  10,  7),
  ('senhoras', 'Rosto Completo',                            6.00,  15,  8),
  ('senhoras', 'Buço',                                      3.00,  10,  9),
  ('senhoras', 'Sobrancelhas',                              3.50,  10, 10),
  ('senhoras', 'Axilas',                                    3.00,  20, 11),
  ('senhoras', 'Braços',                                   10.00,  30, 12),
  ('senhoras', 'Antebraços',                                5.00,  15, 13),
  ('senhoras', 'Virilha Normal',                            3.00,  20, 14),
  ('senhoras', 'Virilha Completa',                          8.00,  30, 15),
  ('senhoras', 'Barriga',                                   5.00,  15, 16),
  ('senhoras', 'Costas',                                    5.00,  30, 17),
  ('senhoras', 'Nádegas',                                   8.00,  30, 18),
  ('senhoras', 'Mãos',                                      5.00,  30, 19),
  ('senhoras', 'Pés',                                      15.00,  60, 20),
  ('senhoras', 'Pés com Calos e/ou Unhas Encravadas',      16.00,  90, 21),
  ('senhoras', 'Cortar Unhas das Mãos',                     2.00,  10, 22),
  ('senhoras', 'Cortar Unhas dos Pés',                      6.00,  10, 23),
  ('senhoras', 'Pintura de Unhas',                          1.50,  10, 24)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- SENHORES
-- ---------------------------------------------------------------------
insert into public.servicos (categoria, nome, preco, duracao_min, ordem) values
  ('senhores', 'Corpo Inteiro',                            45.00, 150,  1),
  ('senhores', 'Perna Inteira',                            25.00,  90,  2),
  ('senhores', 'Meia-Perna',                               15.00,  45,  3),  -- <<< CONFIRMAR preço e duração
  ('senhores', 'Axilas',                                    5.00,  10,  4),
  ('senhores', 'Sobrancelhas',                              3.00,  10,  5),
  ('senhores', 'Tronco',                                   15.00,  30,  6),
  ('senhores', 'Tronco + Axilas',                          16.00,  40,  7),
  ('senhores', 'Tronco + Axilas + Costas',                 19.00,  60,  8),
  ('senhores', 'Braço',                                    15.00,  30,  9),
  ('senhores', 'Antebraço',                                10.00,  25, 10),
  ('senhores', 'Virilhas',                                  5.00,  20, 11),  -- <<< CONFIRMAR preço e duração
  ('senhores', 'Barriga / Abdómen',                        15.00,  15, 12),
  ('senhores', 'Costas',                                   15.00,  30, 13),
  ('senhores', 'Nádegas',                                  15.00,  40, 14),
  ('senhores', 'Mãos',                                      5.00,  30, 15),
  ('senhores', 'Pés',                                      15.00,  90, 16),
  ('senhores', 'Pés com Calos e/ou Unhas Encravadas',      16.00,  90, 17),
  ('senhores', 'Cortar Unhas das Mãos',                     2.00,  10, 18),
  ('senhores', 'Cortar Unhas dos Pés',                      6.00,  10, 19)
on conflict do nothing;
