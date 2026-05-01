/* ============================================================================
   NCM Categories
   Mapeia prefixos da NCM (Nomenclatura Comum do Mercosul) e palavras-chave
   para categorias amigáveis em português. NFC-e brasileira tem NCM em todo
   item — assim a gente categoriza sem depender de tabela manual.

   Como funciona:
   1. Tenta match no prefixo de 4 dígitos (mais específico)
   2. Cai pro prefixo de 2 dígitos
   3. Refina por keyword na descrição (ex: NCM 2202 vs descrição "REFRIG")
   4. Fallback: "Outros"
   ============================================================================ */

(function (global) {
  'use strict';

  // Match por prefixo NCM (mais específico antes)
  const NCM_PREFIX_4 = {
    '0207': { id: 'aves', name: 'Aves', icon: '🍗' },
    '0210': { id: 'carnes-curadas', name: 'Carnes curadas', icon: '🥓' },
    '0304': { id: 'pescado', name: 'Pescado', icon: '🐟' },
    '0306': { id: 'pescado', name: 'Pescado', icon: '🦐' },
    '0401': { id: 'laticinios', name: 'Laticínios', icon: '🥛' },
    '0402': { id: 'laticinios', name: 'Laticínios', icon: '🥛' },
    '0405': { id: 'laticinios', name: 'Laticínios', icon: '🧈' },
    '0406': { id: 'laticinios', name: 'Laticínios', icon: '🧀' },
    '0702': { id: 'hortifruti', name: 'Hortifrúti', icon: '🥬' },
    '0703': { id: 'hortifruti', name: 'Hortifrúti', icon: '🧅' },
    '0706': { id: 'hortifruti', name: 'Hortifrúti', icon: '🥕' },
    '0709': { id: 'hortifruti', name: 'Hortifrúti', icon: '🥬' },
    '0710': { id: 'hortifruti', name: 'Hortifrúti', icon: '🥔' },
    '0712': { id: 'hortifruti', name: 'Hortifrúti', icon: '🧅' },
    '0713': { id: 'graos', name: 'Grãos', icon: '🫘' },
    '0901': { id: 'cafe-cha', name: 'Café & chá', icon: '☕' },
    '0904': { id: 'temperos', name: 'Temperos', icon: '🌶' },
    '0909': { id: 'temperos', name: 'Temperos', icon: '🌿' },
    '0910': { id: 'temperos', name: 'Temperos', icon: '🌿' },
    '1005': { id: 'graos', name: 'Grãos', icon: '🌽' },
    '1006': { id: 'arroz', name: 'Arroz', icon: '🍚' },
    '1101': { id: 'farinhas', name: 'Farinhas', icon: '🌾' },
    '1104': { id: 'graos', name: 'Cereais', icon: '🌾' },
    '1211': { id: 'temperos', name: 'Temperos', icon: '🌿' },
    '1507': { id: 'oleos', name: 'Óleos', icon: '🛢' },
    '1509': { id: 'oleos', name: 'Azeite', icon: '🫒' },
    '1517': { id: 'oleos', name: 'Margarina', icon: '🧈' },
    '1601': { id: 'embutidos', name: 'Embutidos', icon: '🌭' },
    '1602': { id: 'embutidos', name: 'Embutidos', icon: '🍖' },
    '1806': { id: 'doces', name: 'Doces', icon: '🍫' },
    '1902': { id: 'massas', name: 'Massas', icon: '🍝' },
    '1904': { id: 'salgadinhos', name: 'Salgadinhos', icon: '🍿' },
    '1905': { id: 'biscoitos-paes', name: 'Biscoitos & pães', icon: '🍪' },
    '2005': { id: 'conservas', name: 'Conservas', icon: '🥫' },
    '2007': { id: 'doces', name: 'Doces & geleias', icon: '🍯' },
    '2008': { id: 'polpas', name: 'Polpas', icon: '🥭' },
    '2103': { id: 'molhos-temperos', name: 'Molhos & temperos', icon: '🧂' },
    '2104': { id: 'molhos-temperos', name: 'Caldos', icon: '🍲' },
    '2202': { id: 'bebidas', name: 'Bebidas', icon: '🥤' },
    '2207': { id: 'bebidas', name: 'Álcool', icon: '🧴' },
    '2209': { id: 'molhos-temperos', name: 'Vinagre', icon: '🍶' },
    '2501': { id: 'temperos', name: 'Sal', icon: '🧂' },
    '2710': { id: 'limpeza', name: 'Limpeza', icon: '🧴' },
    '2828': { id: 'limpeza', name: 'Limpeza', icon: '🧴' },
    '3306': { id: 'higiene', name: 'Higiene', icon: '🪥' },
    '3307': { id: 'higiene', name: 'Higiene', icon: '🧴' },
    '3401': { id: 'higiene', name: 'Higiene', icon: '🧼' },
    '3402': { id: 'limpeza', name: 'Limpeza', icon: '🧽' },
    '3405': { id: 'limpeza', name: 'Limpeza', icon: '✨' },
    '3809': { id: 'limpeza', name: 'Limpeza', icon: '🧴' },
    '3920': { id: 'utilidades', name: 'Utilidades', icon: '📦' },
    '3923': { id: 'utilidades', name: 'Utilidades', icon: '🛍' },
    '3924': { id: 'utilidades', name: 'Utilidades', icon: '🪣' },
    '4818': { id: 'higiene', name: 'Papéis higiênicos', icon: '🧻' },
    '5607': { id: 'utilidades', name: 'Utilidades', icon: '🪢' },
    '6307': { id: 'utilidades', name: 'Panos', icon: '🧺' },
    '6805': { id: 'limpeza', name: 'Limpeza', icon: '🧽' },
    '7323': { id: 'limpeza', name: 'Limpeza', icon: '🧽' },
    '7607': { id: 'utilidades', name: 'Utilidades', icon: '🪟' },
    '8212': { id: 'higiene', name: 'Higiene', icon: '🪒' },
    '9603': { id: 'limpeza', name: 'Escovas', icon: '🪥' },
    '9619': { id: 'higiene', name: 'Higiene', icon: '🩷' }
  };

  const NCM_PREFIX_2 = {
    '02': { id: 'carnes', name: 'Carnes', icon: '🥩' },
    '03': { id: 'pescado', name: 'Pescado', icon: '🐟' },
    '04': { id: 'laticinios', name: 'Laticínios', icon: '🥛' },
    '07': { id: 'hortifruti', name: 'Hortifrúti', icon: '🥗' },
    '08': { id: 'frutas', name: 'Frutas', icon: '🍎' },
    '09': { id: 'temperos', name: 'Temperos', icon: '🌿' },
    '10': { id: 'graos', name: 'Grãos', icon: '🌾' },
    '11': { id: 'farinhas', name: 'Farinhas', icon: '🌾' },
    '15': { id: 'oleos', name: 'Óleos & gorduras', icon: '🛢' },
    '16': { id: 'embutidos', name: 'Embutidos', icon: '🌭' },
    '17': { id: 'doces', name: 'Açúcar & doces', icon: '🍯' },
    '18': { id: 'doces', name: 'Cacau & chocolate', icon: '🍫' },
    '19': { id: 'massas', name: 'Massas & biscoitos', icon: '🍝' },
    '20': { id: 'conservas', name: 'Conservas', icon: '🥫' },
    '21': { id: 'molhos-temperos', name: 'Molhos & temperos', icon: '🧂' },
    '22': { id: 'bebidas', name: 'Bebidas', icon: '🥤' },
    '25': { id: 'temperos', name: 'Sal', icon: '🧂' },
    '33': { id: 'higiene', name: 'Higiene', icon: '🧴' },
    '34': { id: 'limpeza', name: 'Limpeza', icon: '🧴' },
    '39': { id: 'utilidades', name: 'Utilidades', icon: '📦' },
    '48': { id: 'higiene', name: 'Papéis', icon: '🧻' },
    '63': { id: 'utilidades', name: 'Tecidos', icon: '🧺' },
    '76': { id: 'utilidades', name: 'Utilidades', icon: '🪟' },
    '96': { id: 'higiene', name: 'Higiene', icon: '🪥' }
  };

  // Refinamentos por keyword (executa depois do match NCM)
  const KEYWORD_OVERRIDES = [
    { test: /\b(REFRIG|COCA|SPRITE|GUARANA|FANTA)\b/i, cat: { id: 'bebidas', name: 'Bebidas', icon: '🥤' } },
    { test: /\b(ACHOC|TODDY|NESCAU)\b/i, cat: { id: 'cafe-cha', name: 'Achocolatados', icon: '🥛' } },
    { test: /\b(PIPOCA)\b/i, cat: { id: 'salgadinhos', name: 'Salgadinhos', icon: '🍿' } },
    { test: /\b(PAO\s+DE\s+FORMA|PAO\b)\b/i, cat: { id: 'biscoitos-paes', name: 'Pães', icon: '🍞' } },
    { test: /\b(BOMBOM)\b/i, cat: { id: 'doces', name: 'Doces', icon: '🍬' } },
    { test: /\b(ABS|ABSORVENTE|FRALDA)\b/i, cat: { id: 'higiene', name: 'Higiene pessoal', icon: '🩷' } }
  ];

  function categorize(item) {
    const ncm = (item.ncm || '').replace(/\D/g, '');
    const desc = item.description || '';

    // 1) keyword overrides têm prioridade
    for (const rule of KEYWORD_OVERRIDES) {
      if (rule.test.test(desc)) return rule.cat;
    }

    // 2) prefixo de 4 dígitos
    if (ncm.length >= 4) {
      const p4 = ncm.substring(0, 4);
      if (NCM_PREFIX_4[p4]) return NCM_PREFIX_4[p4];
    }

    // 3) prefixo de 2 dígitos
    if (ncm.length >= 2) {
      const p2 = ncm.substring(0, 2);
      if (NCM_PREFIX_2[p2]) return NCM_PREFIX_2[p2];
    }

    // 4) fallback
    return { id: 'outros', name: 'Outros', icon: '📦' };
  }

  // Ordem preferida pra exibir categorias (alimentação primeiro, limpeza depois)
  const CATEGORY_ORDER = [
    'hortifruti', 'frutas', 'carnes', 'aves', 'pescado', 'embutidos', 'carnes-curadas',
    'laticinios', 'arroz', 'graos', 'farinhas', 'massas', 'oleos',
    'molhos-temperos', 'temperos', 'conservas', 'polpas',
    'biscoitos-paes', 'doces', 'salgadinhos', 'cafe-cha', 'bebidas',
    'higiene', 'limpeza', 'utilidades', 'outros'
  ];

  function categoryOrder(catId) {
    const idx = CATEGORY_ORDER.indexOf(catId);
    return idx === -1 ? 999 : idx;
  }

  global.NCMCategories = { categorize, categoryOrder };
})(window);
