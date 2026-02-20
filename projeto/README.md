# 🧬 Anotador Proteico - Setup & Run

## Estrutura do Projeto

```
projeto/
├── backend/              # FastAPI Backend
│   ├── main.py          # Aplicação principal
│   ├── models.py        # Modelos Pydantic
│   ├── utils.py         # Funções auxiliares
│   └── requirements.txt  # Dependências Python
│
└── frontend/            # Frontend Web
    ├── index.html       # Página principal (SPA)
    ├── style.css        # Estilos
    └── script.js        # Lógica JavaScript
```

## Instalação & Execução

### 1️⃣ Backend (Python/FastAPI)

#### Pré-requisitos
- Python 3.8+
- pip

#### Setup

```bash
# Navegar até a pasta do backend
cd projeto/backend

# Criar ambiente virtual (opcional mas recomendado)
python -m venv venv

# Ativar ambiente virtual
# Windows:
.\venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Rodar o servidor
python main.py
```

O servidor estará disponível em:
- **API**: http://localhost:8000
- **Documentação interativa**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### 2️⃣ Frontend (Web)

```bash
# Opção 1: Abrir diretamente no navegador
# Abrir o arquivo: projeto/frontend/index.html

# Opção 2: Servir com Python (recomendado)
cd projeto/frontend
python -m http.server 8080

# Depois acessar: http://localhost:8080
```

## Endpoints da API

### Health Check
```
GET /health
```
Retorna status da API

### Upload AntiSMASH
```
POST /api/upload-antismash
Content-Type: multipart/form-data

Body: file (.gbk ou .zip)
```

Extrai proteínas hipotéticas e retorna dados para análise.

**Response exemplo:**
```json
{
  "file_name": "region001.gbk",
  "proteins_analyzed": 12,
  "proteins_with_domains": 8,
  "proteins": [
    {
      "seq_id": "hyp_1",
      "protein_name": "Hypothetical protein 1",
      "region": "region 1",
      "cluster_type": "PKS",
      "domain_count": 3,
      "domains": [
        {
          "name": "Ketoacyl synthase",
          "accession": "PF00109",
          "databases": ["PFAM", "SMART", "PROSITE"],
          "confidence": "Alta",
          "evalue": "3.4e-60",
          "start": 120,
          "end": 280
        }
      ],
      "confidence_level": "Alta"
    }
  ]
}
```

### Predict Domains
```
POST /api/predict-domains
Content-Type: application/json

Body:
{
  "seq_id": "minha_proteina",
  "sequence": "MKLSKNQNLL...",
  "email": "user@example.com"
}
```

Analisa uma sequência proteica única e retorna domínios encontrados.

**Response exemplo:**
```json
{
  "type": "sequence",
  "proteins": [
    {
      "seq_id": "minha_proteina",
      "domain_count": 2,
      "domains": [
        {
          "name": "Seven Transmembrane Receptor",
          "accession": "PF00001",
          "databases": ["PFAM", "SMART", "PROSITE"],
          "confidence": "Alta",
          "evalue": "2.1e-50",
          "start": 45,
          "end": 89
        }
      ],
      "confidence_level": "Alta"
    }
  ]
}
```

## Estado Atual

✅ **Backend funcionando:**
- API FastAPI completa
- Endpoints implementados
- Extração de proteínas de arquivos GBK/ZIP
- Dados placeholder para testes (sem análise real do InterProScan)

✅ **Frontend funcionando:**
- Interface completa com 4 páginas
- Navegação suave entre seções
- Integração com API backend
- Exibição de resultados formatados
- Design responsive

## Próximas Etapas

1. **Integrar InterProScan Real**
   - Conectar com API REST do InterProScan (EBI)
   - Implementar job submission e polling
   - Processar resultados JSON reais

2. **Adicionar Database**
   - Armazenar resultados em PostgreSQL
   - Permitir histórico de análises
   - Cache de resultados

3. **Melhorar UI/UX**
   - Adicionar gráficos de domínios
   - Exportar resultados em PDF
   - Dark mode

4. **Deploy**
   - Containerizar com Docker
   - Deploy em cloud (Heroku, AWS, Azure)
   - CI/CD com GitHub Actions

## Troubleshooting

### Erro: "Connection refused" ao chamar API
- Verificar se o backend está rodando: `http://localhost:8000/health`
- Verificar if CORS está habilitado no backend

### Erro: "Arquivo muito grande"
- Máximo de 500MB por arquivo
- Comprimir antes de enviar se necessário

### Erro: "Nenhuma proteína hipotética encontrada"
- Verificar se o arquivo é um GBK válido do antiSMASH
- Arquivo pode não conter proteínas com "hypothetical protein" na anotação

## API Documentation

Após rodar o backend, acesse:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

Lá você pode testar os endpoints interativamente.

## Desenvolvimento Local

Para desenvolvimento, é recomendado rodar ambos em paralelo:

**Terminal 1 - Backend:**
```bash
cd projeto/backend
python main.py
```

**Terminal 2 - Frontend:**
```bash
cd projeto/frontend
python -m http.server 8080
```

Depois abrir navegador em: http://localhost:8080

---

**Status**: MVP funcionando com dados placeholder ✅
**Próximo**: Integração com InterProScan real
