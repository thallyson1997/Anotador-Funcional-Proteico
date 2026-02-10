# Anotador Funcional Proteico

Este repositório contém dois notebooks em Python que realizam **anotação funcional de proteínas baseada em domínios** usando a API REST do **InterProScan (EBI)**.

- `anotador_proteico_colab_antismash.ipynb` – pipeline completo orientado a **clusters de biossíntese (BGCs)** a partir de resultados do **antiSMASH**.
- `anotador_proteico_interpro_single_sequence.ipynb` – pipeline simplificado para **uma única sequência proteica** informada como string.

Os dois fluxos utilizam a mesma lógica central de:
- consulta ao InterProScan envolvendo múltiplos bancos (Pfam, SMART, PROSITE, PANTHER, Gene3D, SUPERFAMILY, PHOBIUS, TMHMM, SIGNALP, etc.);
- **classificação por confiança** baseada no número de bancos de domínios que concordam;
- geração de **visualizações** e **relatórios de texto**.

---

## 1. Requisitos

Ambos os notebooks foram pensados para rodar em **Google Colab**, mas também funcionam em qualquer ambiente com Python 3 e `pip`.

Bibliotecas Python usadas:
- `biopython`
- `pandas`
- `matplotlib`
- `seaborn`
- `requests`

Cada notebook possui uma seção "0. Configuração Inicial" que instala/garante esses pacotes automaticamente via `pip`.

Além disso, é necessário:
- acesso à internet (para chamar a API do InterProScan);
- um **e-mail de contato válido**, informado em uma variável `user_email`, exigido pelo serviço do EBI.

---

## 2. Notebook: anotador_proteico_colab_antismash.ipynb

### 2.1. Objetivo

Workflow completo para:
1. Ler resultados do **antiSMASH** (regiões BGC em `.region*.gbk` e opcionalmente JSON).
2. **Extrair proteínas hipotéticas** que estejam dentro dos clusters de metabólitos secundários.
3. Enviar as sequências dessas proteínas para o **InterProScan** (modo completo, múltiplos bancos).
4. Organizar e consolidar as anotações de domínios em CSVs.
5. Calcular uma **classificação por confiança** por proteína, baseada em quantos bancos de domínios distintos a anotam.
6. Anotar **características topológicas** (transmembrana, peptídeo sinal) quando disponíveis.
7. Gerar **gráficos de resumo** e um **relatório textual detalhado**.

### 2.2. Principais seções

Resumidamente, o notebook está organizado em:

1. **0. Configuração Inicial do Ambiente**  
   - Instala `biopython`, `pandas`, `matplotlib`, `seaborn`, `requests`.  
   - Cria as pastas `dados/` e `outputs/`.  
   - (Opcional) monta o Google Drive em Colab e define o diretório de trabalho.

2. **1. Upload dos Resultados do antiSMASH**  
   - Upload de um `.zip` com os resultados ou de arquivos individuais `.region*.gbk`/`.json`.  
   - Extrai tudo para `dados/antismash_output/` e lista os arquivos encontrados.

3. **2. Análise e Carregamento dos Resultados antiSMASH**  
   - Lê os arquivos `.region*.gbk` com **Biopython**.  
   - Identifica cada BGC (arquivo de região, número da região, tipo de cluster).  
   - Armazena metadados em uma lista `bgc_data`.

4. **3. Extração de Proteínas Hipotéticas dos Clusters BGC**  
   - Usa uma função `is_hypothetical_protein` para reconhecer proteínas hipotéticas com base em `product`/`note`.  
   - Percorre todos os `CDS` das regiões BGC, registra as proteínas hipotéticas e gera:  
     - `outputs/output_log.txt` – log textual detalhado;  
     - `outputs/proteinas_hipoteticas.csv` – tabela com metadados e sequência.  
   - Cria a coluna `FASTA_ID` (usa `protein_id` quando existe; caso contrário, IDs gerados como `hyp_1`, `hyp_2`, ...).

5. **3.1 Diagnóstico de IDs**  
   - Mostra quantas proteínas têm/ não têm `protein_id`.  
   - Exibe exemplos de `FASTA_ID` para conferir.

6. **4. Predição de Domínios Conservados e Famílias Proteicas (InterProScan)**  
   - Seção central de anotação de domínios.  
   - Permite escolher se deseja:
     - processar **todas** as proteínas hipotéticas;  
     - processar apenas um **número N** inicial;  
     - processar **somente a primeira** (para testes rápidos).
   - Função `search_all_databases(sequence, seq_id, email, timeout)` chama o **InterProScan iprscan5** sem restringir `applications`, retornando domínios de diversos bancos (Pfam, SMART, PROSITE, PANTHER, Gene3D, SUPERFAMILY, CDD, etc.).  
   - Resultados são reunidos em `df_all_domains` e salvos em:
     - `outputs/output_all_domains_consolidated.csv` – todas as anotações;  
     - `outputs/output_<banco>_domains.csv` – um arquivo por banco (quando houver dados).

7. **4.3 Classificação por Confiança e Integração**  
   - Carrega o CSV consolidado (`output_all_domains_consolidated.csv`).  
   - Separa bancos em:
     - **funcionais** / **estruturais** (usados na confiança): Pfam, SMART, PROSITE, PANTHER, Gene3D, SUPERFAMILY, CDD, etc.;  
     - **topologia/características**: PHOBIUS, TMHMM, SIGNALP, COILS, MOBIDB_LITE, etc.  
   - Para cada proteína (via `FASTA_ID`):
     - conta quantos bancos de domínios a anotam;  
     - conta quantos domínios distintos aparecem;  
     - define um rótulo de confiança:
       - alta (≥5 bancos), média (3–4), baixa (1–2), nenhum.  
   - Extrai também informações topológicas (regiões transmembrana, peptídeo sinal).  
   - Enriquecer o DataFrame `df` original com colunas de confiança e topologia, salvando em:  
     - `outputs/proteinas_com_dominios_anotadas.csv`.

8. **4.4 Visualizações e Análise de Domínios**  
   - Gera uma figura com 6 subplots, incluindo:
     - distribuição dos níveis de confiança;  
     - número de bancos de domínios por proteína;  
     - % de proteínas com domínios por tipo de BGC;  
     - boxplots de score de confiança por BGC;  
     - distribuição de características topológicas;  
     - relação entre domínios e presença de regiões transmembrana.  
   - Salva em:  
     - `outputs/domain_analysis_complete.png`.

9. **4.5 Relatório Final**  
   - Gera um relatório detalhado em:  
     - `outputs/relatorio_dominios_lichen.txt` (nome histórico, mas aplicável a qualquer organismo).  
   - Conteúdo: resumo global, distribuição por tipo de BGC, lista das proteínas melhor anotadas, destaques com domínios + topologia, notas interpretativas.

10. **Teste com sequência conhecida (ABC transporter)**  
    - Opcional, usado como controle positivo para ver se múltiplos bancos recuperam o domínio esperado com alta confiança.

### 2.4. Executar no Google Colab

Você pode abrir este notebook diretamente no Colab usando o link abaixo:

- [Abrir anotador_proteico_colab_antismash.ipynb no Google Colab](https://colab.research.google.com/github/thallyson1997/Anotador-Funcional-Proteico/blob/main/anotador_proteico_colab_antismash.ipynb)

### 2.3. Entrada e saída principais

- **Entrada**: arquivos de resultados do antiSMASH (`.region*.gbk`, `.json`, tipicamente dentro de um `.zip`).
- **Saídas principais (pasta `outputs/`)**:
  - `output_log.txt` – log textual da extração de proteínas hipotéticas.
  - `proteinas_hipoteticas.csv` – tabela de proteínas hipotéticas extraídas dos BGCs.
  - `output_all_domains_consolidated.csv` e `output_<banco>_domains.csv` – domínios anotados por InterProScan.
  - `proteinas_com_dominios_anotadas.csv` – proteínas com colunas de confiança e topologia.
  - `domain_analysis_complete.png` – figura com os principais gráficos.
  - `relatorio_dominios_lichen.txt` – relatório textual detalhado.

---

## 3. Notebook: anotador_proteico_interpro_single_sequence.ipynb

### 3.1. Objetivo

Este notebook implementa uma versão mais simples do pipeline para o caso em que você tem **apenas uma sequência proteica** (como string) e deseja:
- enviar essa sequência ao **InterProScan**;
- obter anotações de domínios/famílias em múltiplos bancos;
- calcular a **confiança** da anotação para essa proteína;
- gerar gráficos simples de apoio;
- produzir um relatório textual curto.

Não há integração com antiSMASH ou BGCs neste notebook.

### 3.2. Fluxo das seções

1. **0. Configuração Inicial do Ambiente**  
   - Instala `biopython`, `pandas`, `matplotlib`, `seaborn`, `requests`.

2. **1. Informar a Sequência Proteica**  
   - Você edita a célula e define:  
     - `seq_id` – identificador da proteína;  
     - `sequence` – string com os aminoácidos (uma linha, sem espaços).  
   - O notebook avisa se `sequence` estiver vazia.

3. **2. Configuração do e-mail para o InterProScan**  
   - Você define `user_email = ""  # INSIRA email aqui`.  
   - O notebook alerta se o e-mail não for preenchido antes de executar a busca.

4. **3. Busca de Domínios via InterProScan**  
   - Define `search_all_databases(sequence, seq_id, email, timeout)` com a mesma lógica robusta do notebook principal.  
   - Envia a sequência única para o InterProScan, faz polling de status, baixa o resultado JSON e converte em `df_domains`.  
   - Salva as anotações em:  
     - `outputs/output_all_domains_single_sequence.csv`.

5. **4. Classificação por Confiança e Integração**  
   - Reutiliza a lógica de confiança:
     - alta (≥5 bancos de domínios), média (3–4), baixa (1–2), nenhum.  
   - Separa bancos de domínios (funcionais/estruturais) dos de topologia.  
   - Gera um dicionário `single_summary` com:
     - número de bancos de domínios;  
     - número de domínios únicos;  
     - nível de confiança;  
     - flags de transmembrana e peptídeo sinal.

6. **5. Visualização e Análise de Domínios**  
   - Gera dois gráficos e salva em:  
     - `outputs/single_sequence_domain_analysis.png`.  
   - Gráficos:  
     - barras (anotações por banco);  
     - pizza (categorias de bancos: Funcional / Estrutural / Topologia / Outros).

7. **6. Relatório Final**  
   - Gera `outputs/relatorio_dominios_single_sequence.txt` com:
     - resumo da sequência (`seq_id`), número de bancos de domínios e domínios;  
     - nível de confiança;  
     - lista de domínios (accession + nome);  
     - interpretação das características topológicas;  
     - notas sobre interpretação de confiança.

### 3.3. Como usar (passo a passo)

1. Abra `anotador_proteico_interpro_single_sequence.ipynb` (por exemplo, no Google Colab).
2. Execute a seção **0** para instalar as dependências.
3. Na seção **1**, edite a célula e preencha `seq_id` e `sequence` com a sua proteína.
4. Na seção **2**, edite `user_email` com o seu e-mail válido.
5. Execute a seção **3** para rodar o InterProScan e gerar `df_domains`.
6. Execute as seções **4**, **5** e **6** para obter classificação, gráficos e relatório final.

### 3.4. Executar no Google Colab

Você também pode abrir este notebook diretamente no Colab:

- [Abrir anotador_proteico_interpro_single_sequence.ipynb no Google Colab](https://colab.research.google.com/github/thallyson1997/Anotador-Funcional-Proteico/blob/main/anotador_proteico_interpro_single_sequence.ipynb)

### 3.5. Exemplo rápido de sequência de teste

Como exemplo mínimo, você pode usar algo como:

```python
seq_id = "teste_peptideo"
sequence = "MKKFFDSRREAALAAATAALAAVAAA"
```

Essa pequena sequência artificial é suficiente apenas para testar o fluxo de chamada ao InterProScan e a geração de arquivos de saída.

---

## 4. Boas práticas e observações

- **Uso responsável do InterProScan (EBI)**:  
  - Informe sempre um e-mail válido em `user_email`;  
  - Evite enviar muitos jobs em paralelo para não sobrecarregar o serviço;  
  - Para grandes conjuntos de proteínas (notebook do antiSMASH), use primeiro testes com poucas sequências e vá aumentando conforme necessário.

- **Reprodutibilidade**:  
  - Os notebooks salvam a maior parte dos resultados intermediários em CSV e imagens na pasta `outputs/`;  
  - Você pode versionar esses arquivos ou integrá-los em outros pipelines/relatórios.

- **Personalização**:  
  - É fácil adaptar os notebooks para outros contextos (por exemplo, conjuntos de proteínas que não vêm do antiSMASH);  
  - Você pode filtrar por tipos específicos de domínios, bancos, ou ajustar os limiares de confiança conforme seu caso de uso.

---

## 5. Estrutura do repositório

- `anotador_proteico_colab_antismash.ipynb` – notebook completo integrado ao antiSMASH e BGCs.
- `anotador_proteico_interpro_single_sequence.ipynb` – notebook simplificado para uma única sequência.
- `main/` – pasta auxiliar (pode conter arquivos de texto ou dados adicionais).
- `outputs/` – criada em tempo de execução pelos notebooks para armazenar CSVs, figuras e relatórios.

---

## 6. Licença

(Adicione aqui a licença do projeto, por exemplo MIT, GPL, etc., conforme sua preferência.)
