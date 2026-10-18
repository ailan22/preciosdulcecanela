-- Datos iniciales tomados de Precios_productos.ods (normalizados).

INSERT INTO categorias (id, nombre) VALUES
  (1,  'Harinas, azúcares y polvos'),
  (2,  'Lácteos y huevos'),
  (3,  'Chocolates y coberturas'),
  (4,  'Frutos secos y frutas'),
  (5,  'Dulces y untables'),
  (6,  'Colorantes y esencias'),
  (7,  'Decoración'),
  (8,  'Verduras'),
  (9,  'Carnes, fiambres y salados'),
  (10, 'Packaging'),
  (11, 'Moldes y utensilios'),
  (12, 'Otros');

INSERT INTO insumos (nombre, categoria_id, precio_paquete, cantidad_paquete, unidad, notas) VALUES
  -- Harinas, azúcares y polvos
  ('Harina',                                 1,   40, 1000, 'g',  NULL),
  ('Maicena',                                1,  200, 3000, 'g',  NULL),
  ('Azúcar',                                 1,   40, 1000, 'g',  NULL),
  ('Azúcar rubia',                           1,   90, 1000, 'g',  NULL),
  ('Azúcar impalpable',                      1,  189, 1000, 'g',  NULL),
  ('Bicarbonato',                            1,  120, 1000, 'g',  NULL),
  ('Polvo de hornear',                       1,   49,  100, 'g',  NULL),
  ('Levadura fresca',                        1,   70,   60, 'g',  NULL),
  ('Levadura instantánea',                   1,   20,   11, 'g',  NULL),
  ('Cacao',                                  1,  500, 1000, 'g',  NULL),
  ('Cacao premium',                          1,  189,  100, 'g',  'En la planilla figuraba como "Cacao caro"'),
  ('Café',                                   1,   40,   10, 'g',  NULL),
  ('Sal',                                    1,   55,  500, 'g',  NULL),

  -- Lácteos y huevos
  ('Huevo',                                  2,  300,   30, 'u',  'Maple de 30'),
  ('Leche fluida',                           2,   45, 1000, 'ml', NULL),
  ('Leche en polvo',                         2,  270, 1000, 'g',  NULL),
  ('Leche condensada',                       2,  110,    1, 'u',  NULL),
  ('Crema de leche 1 kg',                    2,  222, 1000, 'g',  NULL),
  ('Crema de leche 1/2 kg',                  2,  140,  500, 'g',  NULL),
  ('Crema UHT',                              2,   60,  200, 'ml', NULL),
  ('Manteca Conaprole 1 kg',                 2,  379, 1000, 'g',  NULL),
  ('Manteca Conaprole 1/2 kg',               2,  205,  500, 'g',  NULL),
  ('Cream cheese 1 kg',                      2,  465,  950, 'g',  'Peso neto 950 g'),
  ('Cream cheese 1/2 kg',                    2,  265,  500, 'g',  NULL),
  ('Cream cheese 3,6 kg',                    2, 1629, 3600, 'g',  NULL),
  ('Ricotta',                                2,  145, 1000, 'g',  NULL),
  ('Queso dambo',                            2,  380, 1000, 'g',  NULL),
  ('Queso rallado',                          2,   60,  100, 'g',  NULL),

  -- Chocolates y coberturas
  ('Chocolate blanco y negro',               3,  350, 1000, 'g',  NULL),
  ('Chocolate cobertura Selecta semiamargo', 3,  410, 1000, 'g',  NULL),
  ('Chispas de chocolate',                   3,  350, 1000, 'g',  NULL),
  ('Cobertura Ledevit chantilly 1 kg',       3,  305, 1000, 'g',  NULL),
  ('Cobertura Ledevit chantilly 1/2 kg',     3,  185,  500, 'g',  NULL),
  ('Crema Ledevit chocolate 1 L',            3,  400, 1000, 'ml', NULL),
  ('Bon o Bon',                              3,   15,    1, 'u',  NULL),

  -- Frutos secos y frutas
  ('Almendras tostadas',                     4,   99,  100, 'g',  NULL),
  ('Nueces partidas',                        4,  173,  250, 'g',  NULL),
  ('Castañas',                               4,  198,  250, 'g',  NULL),
  ('Coco rallado',                           4,  289, 1000, 'g',  NULL),
  ('Pasas de uva',                           4,  250, 1000, 'g',  NULL),
  ('Frutas abrillantadas',                   4,  219, 1000, 'g',  NULL),
  ('Cerezas cortadas',                       4,  270,  750, 'g',  NULL),
  ('Durazno en almíbar',                     4,   80,    1, 'u',  'Lata'),
  ('Limón',                                  4,   90, 1000, 'g',  NULL),
  ('Manzana',                                4,   90, 1000, 'g',  NULL),
  ('Leche de coco',                          4,   80,  500, 'ml', NULL),

  -- Dulces y untables
  ('Dulce de leche 3 kg',                    5,  679, 3000, 'g',  NULL),
  ('Dulce de leche 5 kg',                    5, 1019, 5000, 'g',  NULL),
  ('Dulce de guayaba',                       5,   40,  400, 'g',  NULL),
  ('Nutella',                                5,  480,  650, 'g',  NULL),
  ('Mantequilla de maní',                    5,  180,  305, 'g',  NULL),
  ('Miel',                                   5,  300, 1000, 'g',  NULL),
  ('Galletas Oreo',                          5,   80,    1, 'u',  'Paquete'),

  -- Colorantes y esencias
  ('Vainilla',                               6,  130, 1000, 'ml', NULL),
  ('Esencia de panettone',                   6,  397,  500, 'ml', NULL),
  ('Colorante',                              6,  140,    1, 'u',  NULL),
  ('Colorante en gel',                       6,  135,   25, 'g',  NULL),
  ('Colorante para chocolate',               6,  120,   12, 'g',  NULL),
  ('Colorante amarillo Hornex',              6,  102, 1000, 'g',  NULL),

  -- Decoración
  ('Pastillaje',                             7,  257,  100, 'g',  NULL),
  ('Esferas decorativas lisas',              7,  149,   20, 'g',  'Verificar si son 20 g o 20 unidades'),
  ('Merenguitos',                            7,  160,    1, 'u',  'Paquete'),

  -- Verduras
  ('Acelga',                                 8,   60,    1, 'u',  'Atado'),
  ('Espinaca',                               8,   55,    1, 'u',  'Atado'),
  ('Puerro',                                 8,   25,    1, 'u',  NULL),
  ('Cebolla',                                8,   60, 1000, 'g',  NULL),
  ('Morrón',                                 8,  120, 1000, 'g',  NULL),
  ('Zanahoria',                              8,   40, 1000, 'g',  NULL),
  ('Zapallito',                              8,   90, 1000, 'g',  NULL),

  -- Carnes, fiambres y salados
  ('Pollo',                                  9,  250, 1000, 'g',  NULL),
  ('Panceta',                                9,  500, 1000, 'g',  NULL),
  ('Atún',                                   9,  200,  500, 'g',  NULL),
  ('Aceite',                                 9,   80, 1000, 'ml', NULL),
  ('Pan de molde',                           9,  500,    1, 'u',  'Verificar precio'),

  -- Packaging
  ('Base blanca 20 cm',                     10,   31,    1, 'u',  NULL),
  ('Base blanca 25 cm',                     10,   59,    1, 'u',  NULL),
  ('Portatorta circular 17x10',             10,   28,    1, 'u',  NULL),
  ('Portatorta circular 22x12',             10,   45,    1, 'u',  NULL),
  ('Caja Juampi (tortas)',                  10,   84,    1, 'u',  NULL),
  ('Caja acetato cuerda 23x16x10',          10,   65,    1, 'u',  NULL),
  ('Caja cupcakes x12',                     10,   73,    1, 'u',  NULL),
  ('Caja cupcakes x6 24x16x18',             10,   58,    1, 'u',  NULL),
  ('Caja desayuno 22x35x8',                 10,   38,    1, 'u',  NULL),
  ('Caja masas con visor 250 g',            10,   23,    1, 'u',  'Para 250 g de masas'),
  ('Caja Pascua calada pétalo',             10,   10,    1, 'u',  NULL),
  ('Caja Pascua con visor 20x20x10',        10,   15,    1, 'u',  NULL),
  ('Bolsa panettone 250 g',                 10,    5,    1, 'u',  'Para panettone de 250 g'),
  ('Bolsa polipropileno 250 g',             10,   55,    1, 'u',  'Verificar si es precio por unidad o por paquete'),
  ('Envase bolas de fraile',                10,   20,    1, 'u',  NULL),
  ('Envase bolas de fraile (vaso salsa)',   10,    4,    1, 'u',  NULL),
  ('Vaso 7 oz',                             10,   84,   12, 'u',  'Paquete de 12'),
  ('Hilo papel liso-mixto 10 m',            10,   15,    1, 'u',  NULL),
  ('Plantillas',                            10,  142,   16, 'u',  'Paquete de 16'),

  -- Moldes y utensilios
  ('Molde budín 350 g',                     11,    9,    1, 'u',  NULL),
  ('Molde pan dulce 250 g',                 11,    4,    1, 'u',  NULL),
  ('Molde pan dulce 500 g',                 11,    7,    1, 'u',  NULL),
  ('Molde huevo 500 g',                     11,  143,    1, 'u',  NULL),
  ('Molde rosca',                           11,   16,    1, 'u',  NULL),
  ('Moldes de papel chicos',                11,  199,    2, 'u',  'Set x2'),
  ('Cucharas de madera chicas 16 cm',       11,   58,   20, 'u',  'Paquete de 20'),
  ('Papel aluminio 30 cm x 7,5 m',          11,   69,    1, 'u',  NULL),

  -- Otros
  ('Petaca whisky',                         12,  200,    1, 'u',  NULL);
