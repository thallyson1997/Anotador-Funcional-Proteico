"""
Backend FastAPI para Anotador Proteico
Processa análise de domínios em proteínas
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import os

from models import (
    Protein, Domain, 
    SequenceAnalysisRequest, 
    SequenceAnalysisResponse,
    AntismashAnalysisResponse,
    HealthResponse
)
from utils import (
    search_interproscan,
    clean_sequence,
    validate_protein_sequence,
    domains_to_protein,
    get_placeholder_proteins,
    extract_proteins_from_file,
)

# ===== INICIALIZAR FASTAPI =====
app = FastAPI(
    title="Anotador Proteico API",
    description="API para análise de domínios em proteínas",
    version="1.0.0"
)

# ===== CORS MIDDLEWARE =====
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permitir requisições do frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== ENDPOINTS =====

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check para verificar se a API está funcionando
    """
    return HealthResponse(
        status="ok",
        version="1.0.0"
    )

@app.get("/api/download-debug")
async def download_debug():
    """
    Download o arquivo de debug com análise completa de proteínas extraídas
    Este arquivo é criado durante o processamento de um arquivo ZIP/GBK
    Contém: total de proteínas, duplicatas, proteínas que aparecem 1x, breakdown por BGC
    """
    debug_file = "debug_proteins.txt"
    if not os.path.exists(debug_file):
        raise HTTPException(
            status_code=404,
            detail="Nenhum arquivo de debug disponível. Faça upload de um arquivo ZIP/GBK primeiro."
        )
    
    return FileResponse(
        path=debug_file,
        media_type="text/plain; charset=utf-8",
        filename="debug_proteins.txt"
    )

@app.post("/api/upload-antismash", response_model=AntismashAnalysisResponse)
async def upload_antismash(file: UploadFile = File(...)):
    """
    Recebe arquivo antiSMASH (.gbk ou .zip)
    Extrai proteínas hipotéticas e retorna dados placeholder para análise
    
    Fluxo:
    1. Validar tamanho do arquivo
    2. Extrair proteínas hipotéticas
    3. Retornar dados para análise
    """
    try:
        # Validar tamanho (máximo 500 MB)
        MAX_SIZE = 500 * 1024 * 1024
        file_contents = await file.read()
        
        if len(file_contents) > MAX_SIZE:
            raise HTTPException(
                status_code=413,
                detail="Arquivo muito grande (máximo 500 MB)"
            )
        
        if not file.filename.endswith(('.gbk', '.zip')):
            raise HTTPException(
                status_code=400,
                detail="Arquivo deve ser .gbk ou .zip"
            )
        
        # ===== PLACEHOLDER: Gerar dados de resultado =====
        # Simula 5 proteínas encontradas
        num_proteins = 5
        placeholder_proteins = get_placeholder_proteins(num_proteins)
        
        return AntismashAnalysisResponse(
            file_name=file.filename,
            proteins_analyzed=num_proteins,
            proteins_with_domains=len([p for p in placeholder_proteins if p.domain_count > 0]),
            proteins=placeholder_proteins
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao processar arquivo: {str(e)}"
        )

@app.post("/api/count-hypothetical-proteins")
async def count_hypothetical_proteins(
    file: UploadFile = File(...),
    filter_by_bgc: str = Form("true")
):
    """
    Conta proteínas hipotéticas no arquivo GBK/ZIP
    Retorna lista de proteínas encontradas para o usuário escolher qual intervalo analisar
    
    Parâmetros:
    - file: arquivo GBK/ZIP
    - filter_by_bgc: se "true", filtra apenas proteínas em clusters BGC (padrão)
                      se "false", retorna todas as proteínas hipotéticas
    """
    try:
        # Converter filter_by_bgc para boolean
        filter_bgc = filter_by_bgc.lower() in ('true', '1', 'yes')
        
        # Validar tamanho
        MAX_SIZE = 500 * 1024 * 1024
        file_contents = await file.read()
        
        if len(file_contents) > MAX_SIZE:
            raise HTTPException(
                status_code=413,
                detail="Arquivo muito grande (máximo 500 MB)"
            )
        
        if not file.filename.endswith(('.gbk', '.zip')):
            raise HTTPException(
                status_code=400,
                detail="Arquivo deve ser .gbk ou .zip"
            )
        
        # Extrair proteínas
        proteins = extract_proteins_from_file(file_contents, file.filename)
        
        # Filtrar por BGC se necessário
        if filter_bgc:
            proteins = [p for p in proteins if p.get("in_bgc", False)]
        
        if not proteins:
            filtered_msg = " em clusters BGC" if filter_bgc else ""
            return {
                "file_name": file.filename,
                "count": 0,
                "proteins": [],
                "filter_by_bgc": filter_bgc,
                "message": f"Nenhuma proteína hipotética foi encontrada{filtered_msg} no arquivo"
            }
        
        return {
            "file_name": file.filename,
            "count": len(proteins),
            "proteins": [
                {
                    "index": p["index"],
                    "locus_tag": p.get("locus_tag", ""),
                    "FASTA_ID": p.get("FASTA_ID", ""),
                    "product": p.get("product", ""),
                    "sequence_length": len(p.get("sequence", "")),
                    "bgc_type": p.get("bgc_cluster_type", "")
                }
                for p in proteins
            ],
            "filter_by_bgc": filter_bgc
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao contar proteínas: {str(e)}"
        )

@app.post("/api/analyze-antismash-range")
async def analyze_antismash_range(
    file: UploadFile = File(...),
    email: str = Form(None),
    start_index: str = Form(None),
    end_index: str = Form(None)
):
    """
    Analisa intervalo de proteínas hipotéticas do arquivo
    
    Parâmetros:
    - file: arquivo GBK/ZIP
    - email: email para InterProScan
    - start_index: primeira proteína a analisar (1-based)
    - end_index: última proteína a analisar (1-based)
    """
    try:
        # Validar que todos os parâmetros foram recebidos
        if not email:
            raise HTTPException(
                status_code=400,
                detail="Email é obrigatório"
            )
        
        if start_index is None or end_index is None:
            raise HTTPException(
                status_code=400,
                detail="Índices inicial e final são obrigatórios"
            )
        
        # Converter índices de string para int
        try:
            start_index = int(start_index)
            end_index = int(end_index)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=400,
                detail="Índices inicial e final devem ser números inteiros"
            )
        
        # Validar índices
        if start_index < 1:
            raise HTTPException(
                status_code=400,
                detail="Índice inicial deve ser >= 1"
            )
        
        if start_index > end_index:
            raise HTTPException(
                status_code=400,
                detail="Índice inicial não pode ser maior que índice final"
            )
        
        # Validar tamanho do arquivo
        MAX_SIZE = 500 * 1024 * 1024
        file_contents = await file.read()
        
        if len(file_contents) > MAX_SIZE:
            raise HTTPException(
                status_code=413,
                detail="Arquivo muito grande"
            )
        
        # Extrair proteínas
        proteins = extract_proteins_from_file(file_contents, file.filename)
        
        if not proteins:
            raise HTTPException(
                status_code=400,
                detail="Nenhuma proteína hipotética encontrada"
            )
        
        # Validar range
        if start_index > len(proteins):
            raise HTTPException(
                status_code=400,
                detail=f"Índice inicial ({start_index}) excede número de proteínas ({len(proteins)})"
            )
        
        # Ajustar end_index se exceder
        end_index = min(end_index, len(proteins))
        
        # Filtrar proteínas para análise
        proteins_to_analyze = proteins[start_index-1:end_index]
        
        print(f"\n📊 Analisando {len(proteins_to_analyze)} proteínas (de {start_index} a {end_index})...")
        
        analyzed_proteins = []
        for protein_data in proteins_to_analyze:
            print(f"  → Analisando {protein_data['product']}...")
            
            # Buscar domínios
            raw_domains = search_interproscan(
                sequence=protein_data['sequence'],
                seq_id=protein_data.get('locus_tag', f"protein_{protein_data['index']}"),
                email=email,
                timeout=600
            )
            
            # Converter para objeto Protein
            protein = domains_to_protein(
                seq_id=protein_data.get('locus_tag', f"protein_{protein_data['index']}"),
                raw_domains=raw_domains if raw_domains else []
            )
            analyzed_proteins.append(protein)
        
        return AntismashAnalysisResponse(
            file_name=file.filename,
            proteins_analyzed=len(analyzed_proteins),
            proteins_with_domains=len([p for p in analyzed_proteins if p.domain_count > 0]),
            proteins=analyzed_proteins
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao analisar: {str(e)}"
        )

@app.post("/api/analyze-antismash-selected")
async def analyze_antismash_selected(
    file: UploadFile = File(...),
    email: str = Form(None),
    selected_indices: str = Form(None)
):
    """
    Analisa proteínas selecionadas do arquivo antiSMASH
    
    Parâmetros:
    - file: arquivo GBK/ZIP
    - email: email para InterProScan
    - selected_indices: JSON string com array de índices (0-based) das proteínas a analisar
    
    Exemplo: selected_indices = "[0, 2, 5]"
    """
    try:
        import json
        
        # Validar que todos os parâmetros foram recebidos
        if not email:
            raise HTTPException(
                status_code=400,
                detail="Email é obrigatório"
            )
        
        if selected_indices is None:
            raise HTTPException(
                status_code=400,
                detail="selected_indices é obrigatório"
            )
        
        # Converter JSON string para lista de índices
        try:
            indices_list = json.loads(selected_indices)
            if not isinstance(indices_list, list):
                raise ValueError("selected_indices deve ser um array JSON")
            indices_list = [int(i) for i in indices_list]
        except (ValueError, json.JSONDecodeError) as e:
            raise HTTPException(
                status_code=400,
                detail=f"Erro ao parsear selected_indices: {str(e)}"
            )
        
        if not indices_list:
            raise HTTPException(
                status_code=400,
                detail="Nenhum índice foi selecionado"
            )
        
        # Validar tamanho do arquivo
        MAX_SIZE = 500 * 1024 * 1024
        file_contents = await file.read()
        
        if len(file_contents) > MAX_SIZE:
            raise HTTPException(
                status_code=413,
                detail="Arquivo muito grande"
            )
        
        # Extrair proteínas
        proteins = extract_proteins_from_file(file_contents, file.filename)
        
        if not proteins:
            raise HTTPException(
                status_code=400,
                detail="Nenhuma proteína hipotética encontrada"
            )
        
        # Validar índices
        max_valid_index = len(proteins) - 1
        for idx in indices_list:
            if idx < 0 or idx > max_valid_index:
                raise HTTPException(
                    status_code=400,
                    detail=f"Índice {idx} está fora do intervalo válido (0-{max_valid_index})"
                )
        
        # Filtrar proteínas para análise
        proteins_to_analyze = [proteins[i] for i in indices_list]
        
        print(f"\n📊 Analisando {len(proteins_to_analyze)} proteínas selecionadas...")
        
        analyzed_proteins = []
        for protein_data in proteins_to_analyze:
            print(f"  → Analisando {protein_data['product']}...")
            
            # Buscar domínios
            raw_domains = search_interproscan(
                sequence=protein_data['sequence'],
                seq_id=protein_data.get('FASTA_ID', protein_data.get('locus_tag', f"protein_{protein_data['index']}")),
                email=email,
                timeout=600
            )
            
            # Converter para objeto Protein
            protein = domains_to_protein(
                seq_id=protein_data.get('FASTA_ID', protein_data.get('locus_tag', f"protein_{protein_data['index']}")),
                raw_domains=raw_domains if raw_domains else []
            )
            analyzed_proteins.append(protein)
        
        return AntismashAnalysisResponse(
            file_name=file.filename,
            proteins_analyzed=len(analyzed_proteins),
            proteins_with_domains=len([p for p in analyzed_proteins if p.domain_count > 0]),
            proteins=analyzed_proteins
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao analisar: {str(e)}"
        )
@app.post("/api/predict-domains", response_model=SequenceAnalysisResponse)
async def predict_domains(request: SequenceAnalysisRequest):
    """
    Analisa uma sequência proteica
    
    Fluxo:
    1. Validar sequência
    2. Chamar InterProScan (EBI) para buscar domínios
    3. Classificar confiança baseado no número de bancos
    4. Retornar resultados
    """
    try:
        # Validar entrada
        if not request.sequence:
            raise HTTPException(
                status_code=400,
                detail="Sequência vazia"
            )
        
        # Limpar sequência
        clean_seq = clean_sequence(request.sequence)
        
        if len(clean_seq) < 10:
            raise HTTPException(
                status_code=400,
                detail="Sequência muito curta (mínimo 10 aminoácidos)"
            )
        
        if not validate_protein_sequence(clean_seq):
            raise HTTPException(
                status_code=400,
                detail="Sequência contém caracteres inválidos"
            )
        
        # Buscar no InterProScan (EBI)
        print(f"\n🔍 Analisando sequência {request.seq_id or 'unknown'}...")
        raw_domains = search_interproscan(
            sequence=clean_seq,
            seq_id=request.seq_id or "sequence_001",
            email=request.email,
            timeout=600
        )
        
        # Converter para modelo Protein
        protein = domains_to_protein(
            seq_id=request.seq_id or "sequence_001",
            raw_domains=raw_domains if raw_domains else []
        )
        
        return SequenceAnalysisResponse(proteins=[protein])
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao processar sequência: {str(e)}"
        )

# ===== SERVIR FRONTEND ESTÁTICO (DEVE SER O ÚLTIMO!) =====
# Mount StaticFiles por último para não interceptar as rotas da API
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="static")
else:
    print(f"⚠️ Pasta frontend não encontrada em: {frontend_path}")

# ===== MAIN =====
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        log_level="info",
        reload=True
    )
