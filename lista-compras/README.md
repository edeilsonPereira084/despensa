# 🛒 Despensa — Lista de Compras Inteligente

App web estático que lê a sua nota fiscal eletrônica do mercado (DANFE NFC-e em PDF) e gera uma lista de compras inteligente para a próxima ida ao supermercado, baseada no que você comprou da última vez.

A ideia é simples: antes de ir ao mercado, você abre o app, vê o que comprou no mês passado, marca o que ainda tem em casa e ajusta as quantidades. O app gera automaticamente a lista do que precisa repor — categorizada e com estimativa de gasto.

## ✨ Como funciona

- Lê PDFs de NFC-e direto no navegador (PDF.js)
- Agrupa itens duplicados (3 unidades do mesmo açúcar = 1 linha com qtd 3)
- Categoriza automaticamente usando a NCM (código fiscal) — sem precisar configurar nada
- Salva no `localStorage` o que você já marcou (ajustes ficam persistidos no dispositivo)
- Funciona 100% no cliente: pode ser hospedado no GitHub Pages sem servidor

## 📂 Estrutura

```
lista-compras/
├── index.html             # SPA principal
├── style.css              # Estilo (tipografia editorial, paleta cream/oliva)
├── app.js                 # Estado e UI
├── pdf-parser.js          # Parser específico para NFC-e
├── ncm-categories.js      # Mapeamento NCM → categoria amigável
├── compras/
│   ├── manifest.json      # Lista de PDFs disponíveis (vc atualiza aqui)
│   └── compra_28MAR.pdf   # Suas notas
└── README.md
```

## 🚀 Deploy no GitHub Pages

1. Crie um repositório no GitHub e suba todos os arquivos:
   ```bash
   git init
   git add .
   git commit -m "Setup inicial"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
   git push -u origin main
   ```

2. No GitHub, vá em **Settings → Pages**:
   - Source: `Deploy from a branch`
   - Branch: `main` / `(root)`
   - Salve

3. Em ~1 minuto, o site estará no ar em `https://SEU-USUARIO.github.io/SEU-REPO/`

## 📥 Como adicionar uma nova compra

A cada compra nova:

1. Salve o PDF da NFC-e em `compras/` seguindo o padrão `compra_<DIA><MES>.pdf`:
   - `compra_28MAR.pdf` (28 de março)
   - `compra_15ABR.pdf` (15 de abril)
   - Para incluir o ano: `compra_15ABR_2026.pdf`

2. Adicione o nome do arquivo em `compras/manifest.json`:
   ```json
   {
     "files": [
       "compra_15ABR.pdf",
       "compra_28MAR.pdf"
     ]
   }
   ```
   (a ordem não importa — o app ordena pela data extraída do nome)

3. Faça commit e push:
   ```bash
   git add compras/
   git commit -m "Compra de 15 de abril"
   git push
   ```

O GitHub Pages vai atualizar automaticamente em ~1 minuto.

> **Mês em português abreviado**: JAN, FEV, MAR, ABR, MAI, JUN, JUL, AGO, SET, OUT, NOV, DEZ

## 🎨 Recursos do app

| Recurso | Como usar |
|---|---|
| **Trocar de compra** | Botão "Compra" no topo direito |
| **Ajustar quantidades** | Botões −/+ ao lado de cada item, ou digite direto |
| **Filtrar** | Chips "Todos / Faltando / Tenho" |
| **Buscar** | Campo de busca acima dos itens |
| **Ver lista pronta** | Botão flutuante "Ver lista" na parte inferior |
| **Compartilhar** | Dentro da lista, botões "Copiar" e "Compartilhar" (WhatsApp, etc.) |

## 🧠 Detalhes técnicos

### Parser NFC-e

O parser tokeniza cada linha do PDF e identifica linhas de item pelo padrão estrutural da DANFE: `<nº item> <código> <descrição> <CFOP-4d> <NCM-8d> <CST> <Qtde> <Un> <Vl.unid> <BcICMS> <Alíq> <ICMS> <Vl.total>`. A unidade (UN/KG/PC) seguida de exatamente 5 valores numéricos é o "âncora" que permite identificar onde termina a descrição.

Itens duplicados (mesmo código aparece em linhas separadas — comum em mercados que escaneiam item por item) são consolidados, somando quantidades e valores.

### Categorização

Usa o NCM (Nomenclatura Comum do Mercosul, sempre presente em NFC-e brasileira) como sinal primário, com um mapeamento de prefixos de 4 e 2 dígitos (`ncm-categories.js`). Algumas regras por palavra-chave fazem refinamentos (ex: "ACHOC TODDYNHO" cai em achocolatados, mesmo que o NCM 22 aponte para bebidas).

### Persistência

O estado da sua lista (quantidades a comprar, o que está em estoque) fica em `localStorage`, com chave `despensa:list:<filename>`. Cada compra tem seu próprio estado, então alternar entre compras antigas funciona sem perder ajustes.

> ⚠️ Como é `localStorage`, o estado fica **apenas no dispositivo** onde você marcou. Se sua esposa abrir do celular dela, ela vai começar do zero (ou continuar de onde ela parou da última vez no celular dela).

## 🧪 Rodar localmente

Como o app usa `fetch` para baixar PDFs, você precisa servir via HTTP (não funciona com `file://`):

```bash
# Python 3
python3 -m http.server 8000

# Node
npx serve .
```

Abra `http://localhost:8000`.

## 📋 Compatibilidade

- Layout testado com NFC-e do estado do **Rio Grande do Norte** (modelo SET-RN). Outros estados que sigam o layout SPED da DANFE NFC-e padrão devem funcionar.
- Browsers modernos (Chrome, Safari, Firefox, Edge — versões recentes).
- Funciona offline depois do primeiro acesso (PDF.js fica em cache).
