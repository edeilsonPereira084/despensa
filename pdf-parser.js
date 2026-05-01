/* ============================================================================
   NFC-e PDF Parser
   Lê o DANFE NFC-e do estado do RN (e similares de outros estados que seguem
   o mesmo layout SPED) e extrai itens estruturados.

   Estratégia:
   1. PDF.js extrai texto agrupado por coordenada Y (linha visual)
   2. Cada linha é tokenizada por espaços
   3. Identifica linhas de item pelo padrão: começa com nº item (1..N),
      tem unidade (UN/KG/PC) seguida de exatamente 5 valores numéricos
   4. Linhas que não casam mas começam por texto são tratadas como continuação
      da descrição da linha anterior (NFC-e quebra descrições longas)
   5. Itens com mesmo código são consolidados (qtde somada, valor somado)
   ============================================================================ */

(function (global) {
  'use strict';

  const UNIT_REGEX = /^(UN|KG|PC|CX|UND|kg|un|pc|cx|und)$/i;
  const NCM_REGEX = /^\d{8}$/;
  const CFOP_REGEX = /^\d{4}$/;
  const NUMBER_REGEX = /^[\d.,]+$/;

  function parseBR(s) {
    if (typeof s !== 'string') return NaN;
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }

  /* ----------------------------------------------------------------------
     Extrai linhas do PDF agrupando textos por coordenada Y
     ---------------------------------------------------------------------- */
  async function extractLinesFromPDF(arrayBuffer) {
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const allLines = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Agrupar por Y (arredondado pra tolerar microvariações)
      const lineMap = new Map();
      for (const it of textContent.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = Math.round(it.transform[5]);
        if (!lineMap.has(y)) lineMap.set(y, []);
        lineMap.get(y).push({ x: it.transform[4], text: it.str });
      }

      // Ordenar linhas top→bottom (Y maior = mais alto na página)
      const sortedY = [...lineMap.keys()].sort((a, b) => b - a);
      for (const y of sortedY) {
        const segs = lineMap.get(y).sort((a, b) => a.x - b.x);
        const line = segs.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
        if (line) allLines.push(line);
      }
    }

    return allLines;
  }

  /* ----------------------------------------------------------------------
     Tenta parsear uma linha como item de NFC-e
     ---------------------------------------------------------------------- */
  function tryParseItemLine(line) {
    const tokens = line.split(/\s+/);
    if (tokens.length < 13) return null;

    // Item nº deve ser 1º token e número
    if (!/^\d+$/.test(tokens[0])) return null;
    // Código deve ser 2º token e número
    if (!/^\d+$/.test(tokens[1])) return null;

    // Achar a unidade: token isolado UN/KG/PC seguido de exatamente 5 valores numéricos
    let unitIdx = -1;
    for (let i = tokens.length - 6; i > 4; i--) {
      if (UNIT_REGEX.test(tokens[i])) {
        // checar que os 5 tokens depois são números
        let ok = true;
        for (let j = 1; j <= 5; j++) {
          if (!NUMBER_REGEX.test(tokens[i + j])) { ok = false; break; }
        }
        if (ok && i + 6 === tokens.length) {
          unitIdx = i;
          break;
        }
      }
    }
    if (unitIdx === -1) return null;

    // Posições à esquerda da unidade: ... CFOP NCM CST Qtde Un
    // unitIdx-1 = Qtde
    // unitIdx-2 = CST (formato 0, 0/60, 1/0, 2/0, 3/0...)
    // unitIdx-3 = NCM (8 dígitos)
    // unitIdx-4 = CFOP (4 dígitos)
    const qtyTok = tokens[unitIdx - 1];
    const cstTok = tokens[unitIdx - 2];
    const ncmTok = tokens[unitIdx - 3];
    const cfopTok = tokens[unitIdx - 4];

    if (!NCM_REGEX.test(ncmTok)) return null;
    if (!CFOP_REGEX.test(cfopTok)) return null;
    if (!/^[\d/]+$/.test(cstTok)) return null;
    if (!NUMBER_REGEX.test(qtyTok)) return null;

    const itemNum = parseInt(tokens[0], 10);
    const code = tokens[1];
    const description = tokens.slice(2, unitIdx - 4).join(' ').trim();
    if (!description) return null;

    const qty = parseBR(qtyTok);
    const unit = tokens[unitIdx].toUpperCase();
    const valueUnit = parseBR(tokens[unitIdx + 1]);
    const valueTotal = parseBR(tokens[unitIdx + 5]);

    if (isNaN(qty) || isNaN(valueTotal)) return null;

    return {
      itemNum,
      code,
      description,
      cfop: cfopTok,
      ncm: ncmTok,
      cst: cstTok,
      qty,
      unit,
      valueUnit,
      valueTotal
    };
  }

  /* ----------------------------------------------------------------------
     Extrai metadados da nota (data, número, total)
     ---------------------------------------------------------------------- */
  function extractMetadata(lines) {
    const meta = {};
    for (const line of lines) {
      const numMatch = line.match(/N[ÚU]MERO:\s*(\d+)\s+S[ÉE]RIE:\s*(\d+)/i);
      if (numMatch) { meta.number = numMatch[1]; meta.series = numMatch[2]; }

      const dateMatch = line.match(/Data de Emiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}:\d{2})?/i);
      if (dateMatch) {
        const [d, m, y] = dateMatch[1].split('/');
        meta.date = `${y}-${m}-${d}`;
        if (dateMatch[2]) meta.dateTime = `${meta.date}T${dateMatch[2]}`;
      }

      const totalMatch = line.match(/Valor Total da Nota.*?R\$\s*([\d.,]+)/i);
      if (totalMatch) meta.total = parseBR(totalMatch[1]);

      const cnpjMatch = line.match(/CNPJ:\s*([\d./-]+)/);
      if (cnpjMatch && !meta.cnpj) meta.cnpj = cnpjMatch[1];

      const razaoMatch = line.match(/RAZ[ÃA]O\s+SOCIAL:\s*(.+)/i);
      if (razaoMatch && !meta.merchant) meta.merchant = razaoMatch[1].trim();
    }
    return meta;
  }

  /* ----------------------------------------------------------------------
     Junta linhas que continuam a descrição (NFC-e quebra strings longas
     no PDF: ex. "PAPEL HIG MAX ... PURE" \n "NEUTRO")
     ---------------------------------------------------------------------- */
  const NOISE_REGEX = /\b(p[áa]gina|cnpj|valor\s+total|valor\s+pago|protocolo|chave|nfc-e|danfe|governo|cpf|raz[ãa]o|ie:|item\s+c[óo]digo|emitente|destinat[áa]rio|forma\s+pagamento|secretaria|situa[çc][ãa]o|impresso|ncm|cfop|qtde|data\s+de|alíquota)\b/i;

  function isContinuationLine(line) {
    if (!line || line.length > 60) return false;
    if (/^\d/.test(line)) return false;          // começa com número → outra coisa
    if (!/[A-Za-zÀ-ÿ]/.test(line)) return false; // precisa ter letra
    if (NOISE_REGEX.test(line)) return false;
    // só palavras curtas em maiúsculas/letras (típico de truncado)
    return /^[A-Za-zÀ-ÿ\s.,&-]+$/.test(line);
  }

  function postProcessItems(rawLines) {
    const items = [];
    let lastItem = null;
    for (const line of rawLines) {
      const parsed = tryParseItemLine(line);
      if (parsed) {
        items.push(parsed);
        lastItem = parsed;
      } else if (lastItem && isContinuationLine(line)) {
        lastItem.description = `${lastItem.description} ${line}`.replace(/\s+/g, ' ').trim();
      }
    }
    return items;
  }

  /* ----------------------------------------------------------------------
     Consolida itens duplicados (mesmo código aparece várias vezes)
     ---------------------------------------------------------------------- */
  function consolidateItems(items) {
    const map = new Map();
    for (const it of items) {
      const key = `${it.code}|${it.description}`;
      if (!map.has(key)) {
        map.set(key, {
          code: it.code,
          description: it.description,
          ncm: it.ncm,
          cfop: it.cfop,
          unit: it.unit,
          qty: 0,
          totalValue: 0,
          unitValue: it.valueUnit,
          occurrences: 0,
          firstItemNum: it.itemNum
        });
      }
      const agg = map.get(key);
      agg.qty += it.qty;
      agg.totalValue += it.valueTotal;
      agg.occurrences += 1;
    }
    // Recalcula valor unitário médio
    const consolidated = [...map.values()].map(it => ({
      ...it,
      avgUnitValue: it.totalValue / it.qty
    }));
    consolidated.sort((a, b) => a.firstItemNum - b.firstItemNum);
    return consolidated;
  }

  /* ----------------------------------------------------------------------
     API pública
     ---------------------------------------------------------------------- */
  async function parseNFCe(arrayBuffer) {
    const lines = await extractLinesFromPDF(arrayBuffer);
    const metadata = extractMetadata(lines);
    const rawItems = postProcessItems(lines);
    const items = consolidateItems(rawItems);

    return {
      metadata,
      items,
      stats: {
        totalItems: items.length,
        totalQty: rawItems.reduce((s, x) => s + x.qty, 0),
        totalValue: items.reduce((s, x) => s + x.totalValue, 0),
        rawCount: rawItems.length
      }
    };
  }

  global.NFCeParser = { parseNFCe };
})(window);
