# 🧬 Anotador Funcional Proteico

Aplicação web para **anotação funcional de proteínas hipotéticas** provenientes de clusters de biossíntese de metabólitos secundários (BGCs). A ferramenta consulta o **InterProScan (EBI)** contra múltiplos bancos de domínios (Pfam, SMART, PROSITE, PANTHER, Gene3D, SUPERFAMILY, CDD, HAMAP, entre outros) e apresenta os resultados em uma interface gráfica interativa, com cálculo de score de confiança, visualização de domínios e exportação dos resultados.

---

## 📋 Funcionalidades

- **Upload de arquivos antiSMASH** (`.gbk` ou `.zip`) com extração automática de proteínas hipotéticas dos BGCs
- **Seleção de proteínas** para análise, com pré-visualização das sequências e clusters de origem
- **Análise via InterProScan** com suporte a todos os bancos de dados disponíveis na API da EBI
- **Score de Confiança V2** (0–100) calculado a partir de quatro critérios independentes: diversidade de bancos, qualidade estatística (e-value), suporte InterPro e consenso posicional
- **Painel de progresso em tempo real** (SSE) com contador, tempo decorrido, mínimo e máximo por proteína
- **Análise de sequência única** — insira uma sequência FASTA diretamente na interface
- **Modais de detalhes** para cada domínio encontrado, com acesso direto à entrada InterPro (EBI)
- **Exportação em ZIP** contendo:
  - `resultados.json` — dados completos em JSON
  - `dominios.csv` — tabela de domínios por proteína
  - `resultados.html` — página HTML standalone com todos os resultados e modais funcionais

---

## 🗂️ Estrutura do Repositório

```
Anotador-Funcional-Proteico/
├── main.py               # Servidor FastAPI (entry point)
├── backend/
│   ├── models.py         # Modelos Pydantic
│   ├── utils.py          # Lógica de análise e integração InterProScan
│   └── requirements.txt  # Dependências Python
├── frontend/
│   ├── index.html        # Interface web (SPA)
│   ├── script.js         # Lógica JavaScript
│   └── style.css         # Estilos
├── notebook/             # Notebooks Jupyter (versão original, ver seção abaixo)
├── dados/                # Dados de exemplo (genoma de referência)
└── .gitignore
```

---

## ⚙️ Instalação

### Pré-requisitos

- Python 3.10 ou superior
- Git

### 1. Clonar o repositório

```bash
git clone https://github.com/thallyson1997/Anotador-Funcional-Proteico.git
cd Anotador-Funcional-Proteico
```

### 2. Criar e ativar o ambiente virtual

**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

**Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate
```

**Windows (CMD):**
```cmd
python -m venv venv
venv\Scripts\activate.bat
```

### 3. Instalar as dependências

```bash
pip install -r backend/requirements.txt
```

---

## 🚀 Executando a aplicação

```bash
python main.py
```

Acesse **http://localhost:8000** no navegador.

O servidor FastAPI também expõe a documentação interativa da API em **http://localhost:8000/docs**.

---

## 🔌 Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Status do servidor |
| `POST` | `/api/upload-antismash` | Upload e análise completa de arquivo GBK/ZIP |
| `POST` | `/api/count-hypothetical-proteins` | Conta proteínas hipotéticas sem analisar |
| `POST` | `/api/analyze-antismash-selected` | Analisa proteínas selecionadas (resposta única) |
| `POST` | `/api/analyze-antismash-selected-stream` | Analisa com progresso em tempo real (SSE) |
| `POST` | `/api/analyze-antismash-range` | Analisa por índice de intervalo |
| `POST` | `/api/predict-domains` | Analisa uma sequência proteica única |

---

## 📓 Notebooks (versão original)

A pasta `notebook/` contém os pipelines originais desenvolvidos para **Google Colab**, que antecederam a aplicação web:

- `anotador_proteico_colab_antismash.ipynb` — pipeline completo para análise de BGCs a partir de resultados do antiSMASH, com geração de CSVs, gráficos e relatório textual
- `anotador_proteico_interpro_single_sequence.ipynb` — versão simplificada para análise de uma única sequência proteica

Ambos podem ser abertos diretamente no Google Colab e são úteis para análises exploratórias ou ambientes sem suporte a servidor web.

---

## 📌 Observações

- É necessário um **e-mail válido** para consultas ao InterProScan (exigido pela EBI). O campo é preenchido na própria interface antes de iniciar a análise.
- A análise de cada proteína pode levar entre 1 e 5 minutos dependendo da fila da EBI.
- Evite submeter muitas sequências em paralelo para não sobrecarregar o serviço público da EBI.

---

Desenvolvido por **Thallyson Gabriel Martins Correia Fontenele**.

- `anotador_proteico_colab_antismash.ipynb` – pipeline completo orientado a **clusters de biossíntese (BGCs)** a partir de resultados do **antiSMASH**.
- `anotador_proteico_interpro_single_sequence.ipynb` – pipeline simplificado para **uma única sequência proteica** informada como string.

Os dois fluxos utilizam a mesma lógica central de:
- consulta ao InterProScan envolvendo múltiplos bancos (Pfam, SMART, PROSITE, PANTHER, Gene3D, SUPERFAMILY, PHOBIUS, TMHMM, SIGNALP, etc.);
- **classificação por confiança** baseada no número de bancos de domínios que concordam;
- geração de **visualizações** e **relatórios de texto**.

---
