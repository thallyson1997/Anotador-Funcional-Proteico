"""
Backend FastAPI para Anotador Proteico
Processa análise de domínios em proteínas
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool
import os
import json
import time

from backend.models import (
    Protein, Domain, 
    SequenceAnalysisRequest, 
    SequenceAnalysisResponse,
    AntismashAnalysisResponse,
    HealthResponse,
    BGCFileMetadata,
    BGCComparisonResponse,
    MIBiGRow,
)
from backend.utils import (
    search_interproscan,
    InterProScanServiceError,
    clean_sequence,
    validate_protein_sequence,
    domains_to_protein,
    get_placeholder_proteins,
    extract_proteins_from_file,
    extract_bgc_types_from_file,
)


def run_interproscan_or_raise(sequence: str, seq_id: str, email: str, timeout: int = 600):
    """Executa consulta ao InterProScan e converte falhas externas em HTTP 503."""
    try:
        return search_interproscan(
            sequence=sequence,
            seq_id=seq_id,
            email=email,
            timeout=timeout
        )
    except InterProScanServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

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


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """
    Retorna o favicon do frontend quando disponível.
    Se não existir, responde sem conteúdo para evitar 404 no log.
    """
    favicon_path = os.path.join(os.path.dirname(__file__), "frontend", "favicon.ico")
    if os.path.exists(favicon_path):
        return FileResponse(path=favicon_path, media_type="image/x-icon")

    return Response(status_code=204)


@app.get("/.well-known/appspecific/com.chrome.devtools.json", include_in_schema=False)
async def chrome_devtools_metadata():
    """
    Responde à sondagem automática do Chrome DevTools sem gerar 404 no log.
    """
    return Response(status_code=204)

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
        filter_bgc = filter_by_bgc.lower() in ('true', '1', 'yes') if filter_by_bgc else False
        
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
        indexed_proteins = list(enumerate(proteins))
        
        # Filtrar por BGC se necessário
        if filter_bgc:
            indexed_proteins = [(i, p) for i, p in indexed_proteins if p.get("in_bgc", False)]
            proteins = [p for _, p in indexed_proteins]
        
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
                    "source_index": source_index,
                    "locus_tag": p.get("locus_tag", "") or p.get("protein_id", "") or p.get("FASTA_ID", ""),
                    "FASTA_ID": p.get("FASTA_ID", ""),
                    "product": p.get("product", ""),
                    "sequence_length": len(p.get("sequence", "")),
                    "bgc_type": p.get("bgc_cluster_type", ""),
                    "cluster_types": p.get("bgc_cluster_types", []),
                    "bgc_region": p.get("BGC_Region"),
                    "bgc_region_label": p.get("BGC_Region_Label"),
                    "bgc_region_display_label": p.get("BGC_Region_Display_Label")
                }
                for source_index, p in indexed_proteins
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
            raw_domains = run_interproscan_or_raise(
                sequence=protein_data['sequence'],
                seq_id=protein_data.get('locus_tag', f"protein_{protein_data['index']}"),
                email=email,
                timeout=600
            )
            
            # Converter para objeto Protein
            protein = domains_to_protein(
                seq_id=protein_data.get('locus_tag', f"protein_{protein_data['index']}"),
                raw_domains=raw_domains if raw_domains else [],
                cluster_types=protein_data.get('bgc_cluster_types', []),
                bgc_region=protein_data.get('BGC_Region'),
                bgc_region_display_label=protein_data.get('BGC_Region_Display_Label'),
                start=protein_data.get('start'),
                end=protein_data.get('end'),
                sequence=protein_data.get('sequence')
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
            try:
                print(f"  → Analisando {protein_data.get('product', 'UNKNOWN')}...")
                
                # Buscar domínios
                raw_domains = run_interproscan_or_raise(
                    sequence=protein_data['sequence'],
                    seq_id=protein_data.get('locus_tag', protein_data.get('FASTA_ID', f"protein_{protein_data['index']}")),
                    email=email,
                    timeout=600
                )
                
                # Converter para objeto Protein
                protein = domains_to_protein(
                    seq_id=protein_data.get('locus_tag', protein_data.get('FASTA_ID', f"protein_{protein_data['index']}")),
                    raw_domains=raw_domains if raw_domains else [],
                    cluster_types=protein_data.get('bgc_cluster_types', []),
                    bgc_region=protein_data.get('BGC_Region'),
                    bgc_region_display_label=protein_data.get('BGC_Region_Display_Label'),
                    start=protein_data.get('start'),
                    end=protein_data.get('end'),
                    sequence=protein_data.get('sequence')
                )
                
                analyzed_proteins.append(protein)
            except Exception as e:
                import traceback
                print(f"  ⚠️ Erro ao analisar proteína: {str(e)}")
                traceback.print_exc()
                raise HTTPException(
                    status_code=400,
                    detail=f"Erro ao processar proteína {protein_data.get('product', 'UNKNOWN')}: {str(e)}"
                )
        
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

@app.post("/api/analyze-antismash-selected-stream")
async def analyze_antismash_selected_stream(
    file: UploadFile = File(...),
    email: str = Form(None),
    selected_indices: str = Form(None)
):
    """Analisa proteínas selecionadas com streaming SSE de progresso."""

    if not email:
        raise HTTPException(status_code=400, detail="Email é obrigatório")
    if selected_indices is None:
        raise HTTPException(status_code=400, detail="selected_indices é obrigatório")

    try:
        indices_list = json.loads(selected_indices)
        if not isinstance(indices_list, list):
            raise ValueError("selected_indices deve ser um array JSON")
        indices_list = [int(i) for i in indices_list]
    except (ValueError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=400, detail=f"Erro ao parsear selected_indices: {str(e)}")

    if not indices_list:
        raise HTTPException(status_code=400, detail="Nenhum índice foi selecionado")

    MAX_SIZE = 500 * 1024 * 1024
    file_contents = await file.read()

    if len(file_contents) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Arquivo muito grande")

    proteins = extract_proteins_from_file(file_contents, file.filename)
    if not proteins:
        raise HTTPException(status_code=400, detail="Nenhuma proteína hipotética encontrada")

    max_valid_index = len(proteins) - 1
    for idx in indices_list:
        if idx < 0 or idx > max_valid_index:
            raise HTTPException(status_code=400, detail=f"Índice {idx} fora do intervalo válido (0-{max_valid_index})")

    proteins_to_analyze = [proteins[i] for i in indices_list]
    file_name = file.filename

    async def generate():
        total = len(proteins_to_analyze)
        protein_ids = [
            p.get('locus_tag') or p.get('FASTA_ID') or f"protein_{p['index']}"
            for p in proteins_to_analyze
        ]

        yield f"data: {json.dumps({'type': 'init', 'total': total, 'proteins': protein_ids})}\n\n"

        analyzed_proteins = []
        for i, protein_data in enumerate(proteins_to_analyze):
            seq_id = protein_ids[i]
            yield f"data: {json.dumps({'type': 'protein_start', 'index': i, 'total': total, 'protein_id': seq_id})}\n\n"

            t_start = time.time()
            try:
                raw_domains = await run_in_threadpool(
                    search_interproscan,
                    sequence=protein_data['sequence'],
                    seq_id=seq_id,
                    email=email,
                    timeout=600
                )
            except InterProScanServiceError as exc:
                yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
                return
            except Exception as exc:
                yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
                return

            elapsed_ms = int((time.time() - t_start) * 1000)

            protein = domains_to_protein(
                seq_id=seq_id,
                raw_domains=raw_domains if raw_domains else [],
                cluster_types=protein_data.get('bgc_cluster_types', []),
                bgc_region=protein_data.get('BGC_Region'),
                bgc_region_display_label=protein_data.get('BGC_Region_Display_Label'),
                start=protein_data.get('start'),
                end=protein_data.get('end'),
                sequence=protein_data.get('sequence')
            )
            analyzed_proteins.append(protein)

            yield f"data: {json.dumps({'type': 'protein_done', 'index': i, 'total': total, 'protein_id': seq_id, 'elapsed_ms': elapsed_ms, 'protein': protein.model_dump()})}\n\n"

        result = AntismashAnalysisResponse(
            file_name=file_name,
            proteins_analyzed=len(analyzed_proteins),
            proteins_with_domains=len([p for p in analyzed_proteins if p.domain_count > 0]),
            proteins=analyzed_proteins
        )
        yield f"data: {json.dumps({'type': 'complete', 'result': result.model_dump()})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
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
        raw_domains = run_interproscan_or_raise(
            sequence=clean_seq,
            seq_id=request.seq_id or "sequence_001",
            email=request.email,
            timeout=600
        )
        
        # Converter para modelo Protein
        protein = domains_to_protein(
            seq_id=request.seq_id or "sequence_001",
            raw_domains=raw_domains if raw_domains else [],
            cluster_types=[],  # Análise de sequência única (sem BGC)
            sequence=clean_seq
        )
        
        return SequenceAnalysisResponse(proteins=[protein])
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao processar sequência: {str(e)}"
        )
# ===== COMPARADOR DE BGCs =====
@app.post("/api/compare-bgc", response_model=BGCComparisonResponse)
async def compare_bgc(
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...),
):
    """
    Compara metadados de BGC de dois arquivos antiSMASH.
    Calcula similaridade de Jaccard sobre os tipos de clusters presentes.
    """
    MAX_SIZE = 500 * 1024 * 1024
    try:
        content_a = await file_a.read()
        content_b = await file_b.read()

        if len(content_a) > MAX_SIZE or len(content_b) > MAX_SIZE:
            raise HTTPException(status_code=413, detail="Arquivo muito grande (máximo 500 MB)")

        for f in [file_a, file_b]:
            if not f.filename.lower().endswith(('.gbk', '.zip')):
                raise HTTPException(
                    status_code=400,
                    detail=f"Arquivo '{f.filename}' deve ser .gbk ou .zip"
                )

        meta_a = extract_bgc_types_from_file(content_a, file_a.filename)
        meta_b = extract_bgc_types_from_file(content_b, file_b.filename)

        set_a = set(meta_a['unique_types'])
        set_b = set(meta_b['unique_types'])
        shared = sorted(set_a & set_b)
        only_a = sorted(set_a - set_b)
        only_b = sorted(set_b - set_a)
        union = set_a | set_b
        jaccard = len(shared) / len(union) if union else 0.0

        # === Nível 3: MIBiG rows ===
        from collections import defaultdict

        def _build_hits_index(hits):
            idx = defaultdict(lambda: {'compound': '', 'similarities': [], 'regions': []})
            for h in hits:
                d = idx[h['bgc_id']]
                d['compound'] = h['compound']
                d['regions'].append(h['region'])
                if h['similarity'] is not None:
                    d['similarities'].append(h['similarity'])
            return idx

        idx_a = _build_hits_index(meta_a.get('mibig_hits', []))
        idx_b = _build_hits_index(meta_b.get('mibig_hits', []))

        all_bgc_ids = sorted(set(idx_a) | set(idx_b))
        mibig_rows = []
        for bgc_id in all_bgc_ids:
            in_a = bgc_id in idx_a
            in_b = bgc_id in idx_b
            compound = (idx_a[bgc_id]['compound'] if in_a else idx_b[bgc_id]['compound'])
            sim_a = max(idx_a[bgc_id]['similarities']) if in_a and idx_a[bgc_id]['similarities'] else None
            sim_b = max(idx_b[bgc_id]['similarities']) if in_b and idx_b[bgc_id]['similarities'] else None
            mibig_rows.append(MIBiGRow(
                bgc_id=bgc_id,
                compound=compound,
                in_a=in_a,
                in_b=in_b,
                similarity_a=sim_a,
                similarity_b=sim_b,
                regions_a=sorted(set(idx_a[bgc_id]['regions'])) if in_a else [],
                regions_b=sorted(set(idx_b[bgc_id]['regions'])) if in_b else [],
            ))
        # Ordenar: compartilhados primeiro, depois exclusivo A, depois exclusivo B
        mibig_rows.sort(key=lambda r: (0 if (r.in_a and r.in_b) else (1 if r.in_a else 2), r.bgc_id))

        return BGCComparisonResponse(
            file_a=BGCFileMetadata(
                filename=file_a.filename,
                bgc_types=meta_a['unique_types'],
                bgc_count=meta_a['bgc_count'],
                organism=meta_a['organism'] or None,
                type_counts=meta_a.get('type_counts', {}),
                mibig_hits=[
                    {'region': h['region'], 'bgc_id': h['bgc_id'],
                     'compound': h['compound'], 'similarity': h.get('similarity')}
                    for h in meta_a.get('mibig_hits', [])
                ],
            ),
            file_b=BGCFileMetadata(
                filename=file_b.filename,
                bgc_types=meta_b['unique_types'],
                bgc_count=meta_b['bgc_count'],
                organism=meta_b['organism'] or None,
                type_counts=meta_b.get('type_counts', {}),
                mibig_hits=[
                    {'region': h['region'], 'bgc_id': h['bgc_id'],
                     'compound': h['compound'], 'similarity': h.get('similarity')}
                    for h in meta_b.get('mibig_hits', [])
                ],
            ),
            shared_types=shared,
            only_in_a=only_a,
            only_in_b=only_b,
            jaccard_similarity=round(jaccard, 4),
            similarity_percent=round(jaccard * 100, 1),
            mibig_rows=mibig_rows,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao comparar arquivos: {str(e)}")

# ===== SERVIR FRONTEND ESTÁTICO (DEVE SER O ÚLTIMO!) =====
# Mount StaticFiles por último para não interceptar as rotas da API
frontend_path = os.path.join(os.path.dirname(__file__), "frontend")
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
        reload=True,
        reload_includes=["*.py"],
        reload_dirs=[str(__file__).replace("main.py", "")]
    )
