"""
Funções utilitárias para análise de proteínas
Integração com InterProScan (EBI) para busca real de domínios
"""

from models import Protein, Domain, ConfidenceV2Breakdown
import requests
import time
import io
import zipfile
import re


class InterProScanServiceError(Exception):
    """Erro ao comunicar ou obter resposta valida do InterProScan."""

# ===== CONSTANTES DE BANCOS DE DADOS =====
# 🔵 Domínios Funcionais (Azul) - 12 tipos
FUNCTIONAL_DOMAINS = [
    'PFAM', 'SMART', 'PROSITE', 'PANTHER', 'PRINTS',
    'PIRSF', 'PIRSR', 'HAMAP', 'TIGERFAMS', 'SFLD', 'CDD', 'NCBIFAM'
]

# 🔴 Domínios Estruturais (Vermelho) - 2 tipos
STRUCTURAL_DOMAINS = ['GENE3D', 'SUPERFAMILY']

# 🟢 Topologia/Localização (Verde) - 5 tipos
TOPOLOGY = [
    'PHOBIUS', 'TMHMM', 'SIGNALP_EUK', 'SIGNALP_GRAM_POSITIVE',
    'SIGNALP_GRAM_NEGATIVE'
]

# 🟡 Características Estruturais (Amarelo) - 2 tipos
STRUCTURAL_FEATURES = ['COILS', 'MOBIDB_LITE']

# Combinação de todos os bancos de domínios
DOMAIN_DATABASES = FUNCTIONAL_DOMAINS + STRUCTURAL_DOMAINS

# Combinação de todos os bancos
ALL_DATABASES = DOMAIN_DATABASES + TOPOLOGY + STRUCTURAL_FEATURES


def _first_qualifier(feature, keys, default=''):
    """Retorna o primeiro qualifier encontrado em uma lista de chaves."""
    qualifiers = getattr(feature, 'qualifiers', {}) or {}
    for key in keys:
        values = qualifiers.get(key)
        if values:
            value = str(values[0]).strip()
            if value:
                return value
    return default


def _extract_main_region_number(raw_value: str, fallback: str) -> str:
    """Extrai o numero principal de regiao (X) de strings como 'Region 11.2'."""
    text = str(raw_value or '').strip()
    if not text:
        return str(fallback)

    match = re.search(r'(\d+)', text)
    if match:
        return match.group(1)

    return str(fallback)


def _extract_region_number_from_source_name(source_name: str) -> str:
    """Extrai o numero global da regiao a partir do nome do arquivo antiSMASH."""
    text = str(source_name or '')
    if not text:
        return ''

    match = re.search(r'region0*(\d+)', text, flags=re.IGNORECASE)
    if match:
        return match.group(1)

    return ''

# ===== PARSER GBK =====

def parse_gbk_content(gbk_content: bytes, source_name: str = '') -> list:
    """
    Extrai proteínas hipotéticas de arquivo GBK com detecção de BGC
    
    Retorna lista de dicts com informações de cada proteína hipotética:
    {
        'index': número sequencial (1-based),
        'locus_tag': identificador do gene,
        'product': nome da proteína,
        'sequence': sequência de aminoácidos,
        'translation_note': anotações opcionais,
        'in_bgc': True se está dentro de cluster BGC,
        'bgc_cluster_types': lista de tipos de clusters (se aplicável),
        'protein_id': identificador da proteína,
        'FASTA_ID': ID único para identificação (protein_id ou hyp_{index})
    }
    """
    proteins = []
    
    try:
        from Bio import SeqIO
        source_region_number = _extract_region_number_from_source_name(source_name)
        
        # Parse usando BioPython
        try:
            gbk_string = gbk_content.decode('utf-8') if isinstance(gbk_content, bytes) else gbk_content
            records = SeqIO.parse(io.StringIO(gbk_string), "genbank")
            
            for record in records:
                contig_id = str(getattr(record, 'id', '') or '').strip()
                region_windows = []
                region_counter = 0
                for feature in record.features:
                    if feature.type == "region":
                        region_counter += 1
                        start = int(feature.location.start) if feature.location else 0
                        end = int(feature.location.end) if feature.location else 0
                        raw_region = _first_qualifier(
                            feature,
                            ['region_number', 'candidate_cluster_number', 'record_number'],
                            default=''
                        )

                        if not raw_region:
                            note_region = _first_qualifier(feature, ['note'], default='')
                            raw_region = note_region

                        region_number = _extract_main_region_number(raw_region, str(region_counter))
                        region_windows.append({
                            'start': start,
                            'end': end,
                            'region_number': region_number
                        })

                # Primeiro, extrair informações sobre protoclusters (clusters específicos com localização)
                # Isso é mais preciso que 'region' porque cada protocluster tem boundaries específicas
                protoclusters = []
                region_cluster_counter = {}
                for feature in record.features:
                    if feature.type == "protocluster":
                        product = feature.qualifiers.get('product', ['Unknown'])[0] if feature.qualifiers.get('product') else 'Unknown'
                        start = int(feature.location.start) if feature.location else 0
                        end = int(feature.location.end) if feature.location else 0
                        raw_proto_number = _first_qualifier(
                            feature,
                            ['protocluster_number', 'candidate_cluster_number'],
                            default=''
                        )
                        raw_parent_region = _first_qualifier(
                            feature,
                            ['region_number', 'record_number'],
                            default=''
                        )

                        matched_region = None
                        for region in region_windows:
                            if not (end <= region['start'] or start >= region['end']):
                                matched_region = region['region_number']
                                break

                        region_label = None
                        proto_text = str(raw_proto_number).strip()
                        parent_region_main = _extract_main_region_number(raw_parent_region, '') if raw_parent_region else ''
                        matched_region_main = _extract_main_region_number(matched_region, '') if matched_region else ''

                        if re.fullmatch(r'\d+\.\d+', proto_text):
                            region_label = f"Region {proto_text}"
                        elif parent_region_main:
                            proto_suffix = _extract_main_region_number(proto_text, '') if proto_text else ''
                            if proto_suffix:
                                region_label = f"Region {parent_region_main}.{proto_suffix}"
                            else:
                                region_cluster_counter[parent_region_main] = region_cluster_counter.get(parent_region_main, 0) + 1
                                region_label = f"Region {parent_region_main}.{region_cluster_counter[parent_region_main]}"
                        elif matched_region_main:
                            proto_suffix = _extract_main_region_number(proto_text, '') if proto_text else ''
                            if proto_suffix:
                                region_label = f"Region {matched_region_main}.{proto_suffix}"
                            else:
                                region_cluster_counter[matched_region_main] = region_cluster_counter.get(matched_region_main, 0) + 1
                                region_label = f"Region {matched_region_main}.{region_cluster_counter[matched_region_main]}"
                        elif proto_text:
                            region_label = f"Region {proto_text}"
                        
                        protoclusters.append({
                            'start': start,
                            'end': end,
                            'cluster_type': product.strip(),
                            'protocluster_number': int(proto_text) if str(proto_text).isdigit() else 0,
                            'region_label': region_label,
                            'region_main_local': parent_region_main or matched_region_main or ''
                        })
                
                # Se não encontrar protocluster, tentar region (fallback para versões antigas)
                if not protoclusters:
                    region_number = 0
                    for feature in record.features:
                        if feature.type == "region":
                            region_number += 1
                            # Pegar TODOS os products (pode haver múltiplos)
                            products = feature.qualifiers.get('product', ['Unknown'])
                            if isinstance(products, list):
                                cluster_types = []
                                for product in products:
                                    # Cada product pode ter múltiplos tipos separados por vírgula
                                    types = [t.strip() for t in product.split(',')]
                                    cluster_types.extend(types)
                            else:
                                cluster_types = [products]
                            
                            start = int(feature.location.start) if feature.location else 0
                            end = int(feature.location.end) if feature.location else 0
                            
                            # Adicionar cada cluster type como uma entrada separada
                            region_label_number = str(region_number)
                            for cluster_type in cluster_types:
                                protoclusters.append({
                                    'start': start,
                                    'end': end,
                                    'cluster_type': cluster_type.strip(),
                                    'protocluster_number': int(region_label_number) if str(region_label_number).isdigit() else region_number,
                                    'region_label': f"Region {region_label_number}",
                                    'region_main_local': region_label_number
                                })
                
                # Agora processar CDS e marcar se estão em BGC
                for feature in record.features:
                    if feature.type == "CDS":
                        # Verificar se é proteína hipotética
                        product = feature.qualifiers.get('product', [''])[0]
                        translation = feature.qualifiers.get('translation', [''])[0]
                        locus_tag = feature.qualifiers.get('locus_tag', [''])[0]
                        protein_id = feature.qualifiers.get('protein_id', [''])[0]
                        
                        if product and 'hypothetical' in product.lower() and translation:
                            # Verificar quais clusters a proteína pertence
                            cds_start = int(feature.location.start) if feature.location else 0
                            cds_end = int(feature.location.end) if feature.location else 0
                            
                            matching_clusters = []
                            for protocluster in protoclusters:
                                # Verificar se CDS está dentro do protocluster
                                # Uma proteína está no cluster se qualquer parte dela se sobrepõe
                                if not (cds_end <= protocluster['start'] or cds_start >= protocluster['end']):
                                    matching_clusters.append({
                                        'type': protocluster['cluster_type'],
                                        'number': protocluster['protocluster_number'],
                                        'region_label': protocluster.get('region_label'),
                                        'region_main_local': protocluster.get('region_main_local')
                                    })
                            
                            # Extrair apenas os tipos de cluster (remover duplicatas)
                            bgc_types = []
                            for cluster_info in matching_clusters:
                                if cluster_info['type'] not in bgc_types:
                                    bgc_types.append(cluster_info['type'])
                            
                            in_bgc = len(bgc_types) > 0
                            region_num = matching_clusters[0]['number'] if matching_clusters else None
                            region_label = matching_clusters[0].get('region_label') if matching_clusters else None
                            region_main_local = (matching_clusters[0].get('region_main_local') or '').strip() if matching_clusters else ''
                            if not region_main_local and region_label:
                                region_main_local = _extract_main_region_number(region_label, '')

                            region_display_label = None
                            if contig_id and region_main_local:
                                region_display_label = f"{contig_id} - Region {region_main_local}"
                            elif contig_id and region_label:
                                region_display_label = f"{contig_id} - {region_label}"
                            
                            # Gerar FASTA_ID: usa protein_id se disponível, senão gera hyp_{índice}
                            next_index = len(proteins) + 1
                            fasta_id = protein_id if protein_id else f"hyp_{next_index}"
                            
                            proteins.append({
                                'index': next_index,
                                'locus_tag': locus_tag,
                                'product': product,
                                'sequence': translation,
                                'translation_note': feature.qualifiers.get('note', [''])[0] if 'note' in feature.qualifiers else '',
                                'in_bgc': in_bgc,
                                'bgc_cluster_types': bgc_types,
                                'BGC_Region': region_num,  # ← Número do protocluster BGC
                                'BGC_Region_Label': region_label,
                                'BGC_Region_Display_Label': region_display_label,
                                'protein_id': protein_id,
                                'FASTA_ID': fasta_id,
                                'start': cds_start,
                                'end': cds_end
                            })
        except Exception as e:
            print(f"Erro ao parsear com BioPython: {e}")
            raise
            
    except ImportError:
        # Fallback: parse manual simples se BioPython não estiver instalado
        print("BioPython não disponível, usando parse manual...")
        proteins = parse_gbk_manual(gbk_content, source_name)
    
    return proteins

def parse_gbk_manual(gbk_content: bytes, source_name: str = '') -> list:
    """
    Parse manual de GBK quando BioPython não está disponível
    (versão simplificada, extrai apenas informações básicas)
    """
    proteins = []
    gbk_text = gbk_content.decode('utf-8') if isinstance(gbk_content, bytes) else gbk_content
    
    # Buscar features CDS com produto hipotético
    lines = gbk_text.split('\n')
    i = 0
    while i < len(lines):
        if 'CDS' in lines[i] and '/product=' in gbk_text[max(0, i*80-500):i*80+500]:
            # Encontrou uma CDS, procurar product e translation
            product = ""
            translation = ""
            locus_tag = ""
            protein_id = ""
            
            # Procurar informações nas próximas linhas
            for j in range(i, min(i+20, len(lines))):
                if '/product=' in lines[j]:
                    product = lines[j].split('/product=')[1].strip().strip('"')
                if '/translation=' in lines[j]:
                    translation = lines[j].split('/translation=')[1].strip().strip('"')
                if '/locus_tag=' in lines[j]:
                    locus_tag = lines[j].split('/locus_tag=')[1].strip().strip('"')
                if '/protein_id=' in lines[j]:
                    protein_id = lines[j].split('/protein_id=')[1].strip().strip('"')
            
            if product and 'hypothetical' in product.lower() and translation:
                next_index = len(proteins) + 1
                fasta_id = protein_id if protein_id else f"hyp_{next_index}"
                
                proteins.append({
                    'index': next_index,
                    'locus_tag': locus_tag,
                    'product': product,
                    'sequence': translation.replace(' ', ''),
                    'translation_note': '',
                    'in_bgc': False,  # Parse manual não detecta BGC, assume False
                    'bgc_cluster_types': [],  # Lista vazia quando não há BGC
                    'protein_id': protein_id,
                    'FASTA_ID': fasta_id
                })
        i += 1
    
    return proteins

def extract_proteins_from_file(file_content: bytes, filename: str) -> list:
    """
    Extrai proteínas hipotéticas de arquivo GBK ou ZIP
    
    Se for ZIP, extrai todos os GBK e combina resultados
    """
    all_proteins = []
    
    try:
        if filename.endswith('.zip'):
            # Extrair GBK do ZIP
            with zipfile.ZipFile(io.BytesIO(file_content)) as zf:
                gbk_files = [f for f in zf.namelist() if f.endswith('.gbk')]
                
                for gbk_name in gbk_files:
                    gbk_bytes = zf.read(gbk_name)
                    proteins = parse_gbk_content(gbk_bytes, gbk_name)
                    all_proteins.extend(proteins)
        else:
            # Parse direto do GBK
            all_proteins = parse_gbk_content(file_content, filename)
    
    except Exception as e:
        print(f"Erro ao extrair proteínas: {e}")
        return []
    
    
    # ===== DEBUG: ANÁLISE DE DUPLICATAS (salvar em arquivo) =====
    debug_output = []
    debug_output.append("="*70)
    debug_output.append("🔍 DEBUG: ANÁLISE DE PROTEÍNAS EXTRAÍDAS")
    debug_output.append("="*70)
    
    debug_output.append(f"\n📊 Total de proteínas extraídas (ANTES de deduplicação): {len(all_proteins)}")
    
    # Contar locus_tags duplicados
    from collections import Counter
    locus_tags = [p.get('locus_tag', '') for p in all_proteins]
    tag_counts = Counter(locus_tags)
    duplicated_tags = {tag: count for tag, count in tag_counts.items() if count > 1 and tag}
    
    # Encontrar proteínas que aparecem apenas uma vez
    single_proteins = {tag: count for tag, count in tag_counts.items() if count == 1}
    
    if duplicated_tags:
        debug_output.append(f"\n⚠️ Locus_tags DUPLICADOS encontrados: {len(duplicated_tags)}")
    else:
        debug_output.append(f"\n✅ Nenhum locus_tag duplicado encontrado")
    
    # CRUCIAL: Mostrar proteínas que aparecem SÓ UMA VEZ
    if single_proteins:
        debug_output.append(f"\n⭐ Proteínas que aparecem APENAS 1x (NÃO foram duplicadas): {len(single_proteins)}")
        for tag in sorted(single_proteins.keys()):
            protein = next(p for p in all_proteins if p.get('locus_tag') == tag)
            bgc_types = protein.get('bgc_cluster_types', [])
            bgc_str = ', '.join(bgc_types) if bgc_types else 'SEM_BGC'
            seq_size = len(protein.get('sequence', ''))
            debug_output.append(f"   - {tag}: bgc={bgc_str}, size={seq_size}aa")
    
    # Análise por BGC
    debug_output.append(f"\n📈 BREAKDOWN POR BGC (ANTES DEDUP):")
    bgc_types = {}
    for p in all_proteins:
        bgc_types_list = p.get('bgc_cluster_types', [])
        # Para cada cluster type (uma proteína pode estar em múltiplos clusters)
        for bgc_type in (bgc_types_list if bgc_types_list else ['SEM_BGC']):
            if bgc_type not in bgc_types:
                bgc_types[bgc_type] = 0
            bgc_types[bgc_type] += 1
    
    for bgc_type in sorted(bgc_types.keys()):
        debug_output.append(f"   - {bgc_type}: {bgc_types[bgc_type]} proteína(s)")
    
    # ===== DEDUPLICAÇÃO =====
    debug_output.append("\n" + "="*70)
    debug_output.append("🔄 APLICANDO DEDUPLICAÇÃO...")
    debug_output.append("="*70)
    
    seen_tags = set()
    deduplicated = []
    
    for protein in all_proteins:
        tag = protein.get('locus_tag', '')
        if tag and tag not in seen_tags:
            seen_tags.add(tag)
            deduplicated.append(protein)
        elif not tag:
            deduplicated.append(protein)
    
    debug_output.append(f"\n✅ Deduplicação concluída:")
    debug_output.append(f"   Antes: {len(all_proteins)} proteínas")
    debug_output.append(f"   Depois: {len(deduplicated)} proteínas")
    debug_output.append(f"   Removido: {len(all_proteins) - len(deduplicated)} duplicatas")
    
    # ===== FILTRAGEM: Remover proteínas que aparecem APENAS 1x =====
    debug_output.append("\n" + "="*70)
    debug_output.append("🔎 FILTRAGEM: Removendo proteins que aparecem APENAS 1x...")
    debug_output.append("="*70)
    
    # Manter apenas proteínas que FORAM duplicadas (apareceram 2+ vezes)
    deduplicated_filtered = [
        p for p in deduplicated 
        if p.get('locus_tag', '') and tag_counts.get(p.get('locus_tag', ''), 0) > 1
    ]
    
    debug_output.append(f"\n✅ Filtragem concluída:")
    debug_output.append(f"   Antes (com 1x): {len(deduplicated)} proteínas")
    debug_output.append(f"   Depois (sem 1x): {len(deduplicated_filtered)} proteínas")
    debug_output.append(f"   Removido: {len(deduplicated) - len(deduplicated_filtered)} (proteínas que appeareceram 1x)")
    
    # Mostrar quais foram removidas
    removed_proteins = [
        p for p in deduplicated 
        if p.get('locus_tag', '') and tag_counts.get(p.get('locus_tag', ''), 0) == 1
    ]
    if removed_proteins:
        debug_output.append(f"\n⚠️ Proteínas removidas (aparecem APENAS 1x):")
        for p in removed_proteins:
            tag = p.get('locus_tag', 'N/A')
            bgc_types_list = p.get('bgc_cluster_types', [])
            bgc_str = ', '.join(bgc_types_list) if bgc_types_list else 'SEM_BGC'
            size = len(p.get('sequence', ''))
            debug_output.append(f"   - {tag}: bgc={bgc_str}, size={size}aa")
    
    # Novo breakdown após deduplicação E filtragem
    debug_output.append(f"\n📈 BREAKDOWN POR BGC (FINAL - APÓS DEDUP + FILTRAGEM):")
    bgc_types_dedup = {}
    for p in deduplicated_filtered:
        bgc_types_list = p.get('bgc_cluster_types', [])
        # Para cada cluster type (uma proteína pode estar em múltiplos clusters)
        for bgc_type in (bgc_types_list if bgc_types_list else ['SEM_BGC']):
            if bgc_type not in bgc_types_dedup:
                bgc_types_dedup[bgc_type] = []
            bgc_types_dedup[bgc_type].append(p.get('locus_tag', 'N/A'))
    
    for bgc_type in sorted(bgc_types_dedup.keys()):
        count = len(bgc_types_dedup[bgc_type])
        debug_output.append(f"   - {bgc_type}: {count} proteína(s)")
    
    debug_output.append(f"\n✨ RESULTADO FINAL: {len(deduplicated_filtered)} proteína(s) (sem duplicatas e sem aparecer apenas 1x)")
    debug_output.append("="*70)
    
    # ===== SALVAR EM ARQUIVO =====
    debug_filename = "debug_proteins.txt"
    try:
        with open(debug_filename, "w", encoding="utf-8") as f:
            f.write("\n".join(debug_output))
        
        # Mostrar resumo no console
        print("\n" + "="*70)
        print("🔍 DEBUG RESUMIDO")
        print("="*70)
        print(f"📊 Total extraído: {len(all_proteins)}")
        print(f"⭐ Proteínas que aparecem SÓ 1x: {len(single_proteins)}")
        print(f"✅ Após dedup: {len(deduplicated)}")
        print(f"🎯 FINAL (sem 1x): {len(deduplicated_filtered)}")
        print(f"\n📁 Detalhes COMPLETOS salvo em: {debug_filename}")
        print("="*70 + "\n")
    except Exception as e:
        print(f"⚠️ Erro ao salvar debug: {e}\n")
    
    return deduplicated_filtered

# ===== VALIDAÇÃO DE SEQUÊNCIAS =====

def clean_sequence(sequence: str) -> str:
    """Remove whitespace e caracteres inválidos da sequência"""
    if not sequence:
        return ""
    return ''.join(sequence.split()).upper()

def validate_protein_sequence(sequence: str) -> bool:
    """Valida se a sequência contém apenas aminoácidos válidos"""
    if not sequence:
        return False
    valid_aa = set('ACDEFGHIKLMNPQRSTVWY*')
    return all(aa in valid_aa for aa in sequence.upper())

# ===== BUSCA NO INTERPROSCAN =====

def search_interproscan(sequence: str, seq_id: str, email: str, timeout: int = 600) -> list:
    """
    Busca domínios no InterProScan (EBI) via API REST para uma sequência proteica
    
    Fluxo:
    1. Submeter sequência ao InterProScan
    2. Aguardar processamento
    3. Recuperar resultados em JSON
    4. Processar e retornar lista de domínios
    
    Args:
        sequence: sequência de aminoácidos
        seq_id: identificador da sequência
        email: email para requisição à EBI
        timeout: tempo máximo de espera (segundos)
    
    Returns:
        lista de dicionários com informações de domínios
    """
    try:
        if not email:
            print("Nenhum e-mail fornecido para InterProScan")
            return []

        print(f"  → Enviando para InterProScan ({seq_id})...", end="", flush=True)
        
        # ===== SUBMETER SEQUÊNCIA =====
        submit_url = "https://www.ebi.ac.uk/Tools/services/rest/iprscan5/run"
        params = {
            'email': email,
            'sequence': sequence,
            'title': seq_id,
            'goterms': 'false',
            'pathways': 'false'
        }
        
        response = requests.post(submit_url, data=params, timeout=30)
        if response.status_code != 200:
            print(f" ⚠️ HTTP {response.status_code}")
            raise InterProScanServiceError(
                "Falha ao iniciar a analise no InterProScan. Tente novamente em instantes."
            )

        job_id = response.text.strip()
        print(f" Job ID: {job_id[:8]}...", end="", flush=True)
        
        # ===== AGUARDAR RESULTADO =====
        poll_interval = 5
        max_attempts = timeout // poll_interval
        attempt = 0

        for attempt in range(max_attempts):
            time.sleep(poll_interval)
            
            try:
                status_resp = requests.get(
                    f"https://www.ebi.ac.uk/Tools/services/rest/iprscan5/status/{job_id}",
                    timeout=10
                )
            except requests.Timeout:
                continue

            if status_resp.status_code != 200:
                continue

            status = status_resp.text.strip()

            # ===== PROCESSAR RESPOSTA =====
            if status == 'FINISHED':
                try:
                    result = requests.get(
                        f"https://www.ebi.ac.uk/Tools/services/rest/iprscan5/result/{job_id}/json",
                        timeout=60
                    )
                except requests.Timeout:
                    print(" ⚠️ Timeout ao baixar resultado")
                    raise InterProScanServiceError(
                        "O InterProScan demorou demais para responder. Tente novamente em instantes."
                    )

                if result.status_code == 200:
                    data = result.json()
                    domains = []
                    
                    # Extrair domínios dos resultados
                    for resultset in data.get('results', []):
                        for match in resultset.get('matches', []):
                            sig = match.get('signature', {})
                            sig_lib = sig.get('signatureLibraryRelease', {})
                            entry = sig.get('entry') or {}
                            locations = match.get('locations', [])

                            if locations:
                                for loc in locations:
                                    domains.append({
                                        'seq_id': seq_id,
                                        'database': sig_lib.get('library', 'UNKNOWN'),
                                        'accession': sig.get('accession', ''),
                                        'name': sig.get('name', ''),
                                        'description': sig.get('description', ''),
                                        'type': sig.get('type', ''),
                                        'evalue': match.get('evalue', None),
                                        'score': match.get('score', None),
                                        'start': loc.get('start', None),
                                        'end': loc.get('end', None),
                                        'interpro_accession': entry.get('accession', ''),
                                        'interpro_name': entry.get('name', '')
                                    })
                            else:
                                domains.append({
                                    'seq_id': seq_id,
                                    'database': sig_lib.get('library', 'UNKNOWN'),
                                    'accession': sig.get('accession', ''),
                                    'name': sig.get('name', ''),
                                    'description': sig.get('description', ''),
                                    'type': sig.get('type', ''),
                                    'evalue': match.get('evalue', None),
                                    'score': match.get('score', None),
                                    'start': None,
                                    'end': None,
                                    'interpro_accession': entry.get('accession', ''),
                                    'interpro_name': entry.get('name', '')
                                })

                    print(f" ✅ {len(domains)} domínios encontrados")
                    return domains
                else:
                    print(f" ⚠️ HTTP {result.status_code}")
                    raise InterProScanServiceError(
                        "O InterProScan retornou uma resposta invalida. Tente novamente em instantes."
                    )

            elif status in ['FAILED', 'ERROR', 'NOT_FOUND']:
                print(f" ⚠️ Status {status}")
                raise InterProScanServiceError(
                    "O InterProScan nao conseguiu concluir a analise. Tente novamente em instantes."
                )
            elif attempt % 10 == 0 and attempt > 0:
                print(".", end="", flush=True)

        print(f" ⏱ Timeout após {max_attempts * poll_interval}s")
        raise InterProScanServiceError(
            "O InterProScan excedeu o tempo limite da analise. Tente novamente em instantes."
        )

    except requests.Timeout:
        print(" ⚠️ Timeout HTTP")
        raise InterProScanServiceError(
            "Nao foi possivel conectar ao InterProScan no tempo esperado. Tente novamente em instantes."
        )
    except requests.ConnectionError:
        print(" ⚠️ ConnectionError")
        raise InterProScanServiceError(
            "Falha de conexao com o InterProScan. Tente novamente em instantes."
        )
    except requests.RequestException as e:
        print(f" ⚠️ {type(e).__name__}: {str(e)[:50]}")
        raise InterProScanServiceError(
            "Erro de comunicacao com o InterProScan. Tente novamente em instantes."
        )
    except InterProScanServiceError:
        raise
    except Exception as e:
        print(f" ⚠️ {type(e).__name__}: {str(e)[:50]}")
        raise InterProScanServiceError(
            "Erro inesperado ao consultar o InterProScan. Tente novamente em instantes."
        )

# ===== CLASSIFICAÇÃO POR CONFIANÇA =====

def classify_confidence(domains: list) -> str:
    """
    Classifica confiança baseado no número de bancos de domínios distintos
    (adaptado do notebook)
    
    - Alta: ≥5 bancos
    - Média: 3-4 bancos
    - Baixa: 1-2 bancos
    - Nenhum: 0 bancos
    """
    if not domains:
        return "Nenhum"
    
    domains_only = [
        d.get('database', 'UNKNOWN') 
        for d in domains 
        if isinstance(d, dict) and (d.get('database') or 'UNKNOWN') in DOMAIN_DATABASES
    ]
    
    if not domains_only:
        return "Nenhum"
    
    unique_dbs = len(set(filter(None, domains_only)))
    
    if unique_dbs >= 5:
        return "Alta"
    elif unique_dbs >= 3:
        return "Média"
    elif unique_dbs >= 1:
        return "Baixa"
    else:
        return "Nenhum"


def count_confidence_databases(domains: list) -> int:
    """Conta quantos bancos funcionais/estruturais distintos sustentam a proteína."""
    if not domains:
        return 0

    domains_only = [
        d.get('database', 'UNKNOWN')
        for d in domains
        if isinstance(d, dict) and (d.get('database') or 'UNKNOWN') in DOMAIN_DATABASES
    ]

    return len(set(filter(None, domains_only))) if domains_only else 0


def _parse_evalue(evalue) -> float:
    """Converte e-value para float; retorna None quando inválido."""
    if evalue is None:
        return None
    try:
        text = str(evalue).strip().upper()
        if text in ('', 'N/A', 'NA', 'NONE', 'NULL'):
            return None
        return float(text)
    except Exception:
        return None


def _intervals_are_concentrated(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    """Define se dois intervalos pertencem ao mesmo agrupamento posicional."""
    return abs(a_start - b_start) <= 9 and abs(a_end - b_end) <= 9


def _cluster_position_hits(real_hits: list) -> tuple:
    """Agrupa intervalos semelhantes e retorna (qtd_agrupamentos_validos, hits_agrupados)."""
    positioned = []
    for hit in real_hits:
        start = hit.get('start')
        end = hit.get('end')
        if isinstance(start, int) and isinstance(end, int) and start <= end:
            positioned.append({
                'start': start,
                'end': end,
                'name': hit.get('name') or hit.get('description') or 'UNKNOWN'
            })

    n = len(positioned)
    if n == 0:
        return 0, 0

    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra = find(a)
        rb = find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(n):
        a_start = positioned[i]['start']
        a_end = positioned[i]['end']
        for j in range(i + 1, n):
            b_start = positioned[j]['start']
            b_end = positioned[j]['end']
            if _intervals_are_concentrated(a_start, a_end, b_start, b_end):
                union(i, j)

    clusters = {}
    for i in range(n):
        root = find(i)
        if root not in clusters:
            clusters[root] = []
        clusters[root].append(positioned[i]['name'])

    valid_clusters = [names for names in clusters.values() if len(names) >= 2]
    singleton_hits = [names[0] for names in clusters.values() if len(names) == 1]
    valid_clusters.sort(key=len, reverse=True)

    if valid_clusters:
        print(f"\n🔗 Agrupamentos posicionais (nomes): {valid_clusters}")
    else:
        print("\n🔗 Agrupamentos posicionais (nomes): []")

    if singleton_hits:
        print(f"🪶 Hits soltos (nomes): {singleton_hits}")
    else:
        print("🪶 Hits soltos (nomes): []")

    valid_cluster_sizes = [len(names) for names in valid_clusters]
    cluster_count = len(valid_cluster_sizes)
    clustered_hits = sum(valid_cluster_sizes)

    return cluster_count, clustered_hits


def classify_confidence_v2(domains: list) -> tuple:
    """
    Classificação V2 (0-100) para reduzir falso "alto" por redundância.

    Componentes:
    - Diversidade de bancos (0-25)
    - Qualidade estatística por e-value (0-25)
    - Suporte InterPro accession (0-25)
    - Consenso posicional entre bancos (0-25)
    """
    empty_breakdown = ConfidenceV2Breakdown()

    if not domains:
        return "Nenhum", 0.0, "Sem hits funcionais/estruturais", empty_breakdown

    real_hits = []
    for d in domains:
        if not isinstance(d, dict):
            continue
        db = (d.get('database') or '').upper().strip()
        if db in DOMAIN_DATABASES:
            real_hits.append(d)

    if not real_hits:
        return "Nenhum", 0.0, "Sem hits em bancos funcionais/estruturais", empty_breakdown

    n_hits = len(real_hits)
    unique_dbs = len({(d.get('database') or '').upper().strip() for d in real_hits if d.get('database')})

    # Qualidade por e-value
    good_hits = 0
    strong_hits = 0
    for d in real_hits:
        evalue = _parse_evalue(d.get('evalue'))
        if evalue is None:
            continue
        if evalue <= 1e-5:
            good_hits += 1
        if evalue <= 1e-20:
            strong_hits += 1

    # Suporte InterPro
    interpro_hits = 0
    for d in real_hits:
        ipr = (d.get('interpro_accession') or '').upper().strip()
        if ipr.startswith('IPR'):
            interpro_hits += 1

    # Consenso posicional por agrupamentos de intervalos semelhantes.
    # Hits soltos (clusters de tamanho 1) não entram no numerador.
    cluster_count, clustered_hits = _cluster_position_hits(real_hits)
    consensus_ratio = clustered_hits / max(1, n_hits)

    db_score = min(unique_dbs / 5.0, 1.0) * 25.0
    quality_ratio = (strong_hits + 0.5 * max(good_hits - strong_hits, 0)) / max(1, n_hits)
    quality_score = min(quality_ratio, 1.0) * 25.0
    interpro_score = (interpro_hits / max(1, n_hits)) * 25.0
    consensus_score = consensus_ratio * 25.0

    final_score = round(db_score + quality_score + interpro_score + consensus_score, 1)

    if final_score >= 75:
        level = "Alta"
    elif final_score >= 50:
        level = "Média"
    elif final_score > 0:
        level = "Baixa"
    else:
        level = "Nenhum"

    explainer = (
        f"dbs={unique_dbs}, hits={n_hits}, e<=1e-5={good_hits}, "
        f"IPR={interpro_hits}, consenso={round(consensus_ratio * 100, 1)}%"
    )
    breakdown = ConfidenceV2Breakdown(
        unique_databases=unique_dbs,
        total_hits=n_hits,
        good_hits=good_hits,
        strong_hits=strong_hits,
        interpro_hits=interpro_hits,
        cluster_count=cluster_count,
        clustered_hits=clustered_hits,
        bucket_count=cluster_count,
        multi_support_buckets=clustered_hits,
        consensus_percent=round(consensus_ratio * 100, 1),
        db_score=round(db_score, 1),
        quality_score=round(quality_score, 1),
        interpro_score=round(interpro_score, 1),
        consensus_score=round(consensus_score, 1)
    )
    return level, final_score, explainer, breakdown

# ===== EXTRAÇÃO DE CARACTERÍSTICAS DE TOPOLOGIA =====

def extract_topology_features(raw_domains: list) -> dict:
    """
    Extrai características topológicas dos domínios (transmembrana, peptídeo sinal, etc)
    
    Returns:
        dict com informações sobre topologia da proteína
    """
    topology_info = {
        'has_transmembrane': False,
        'has_signal_peptide': False,
        'has_coils': False,
        'has_mobidb': False,
        'topology_annotations': []
    }
    
    if not raw_domains:
        return topology_info
    
    # Processar cada domínio
    for d in raw_domains:
        if not d or not isinstance(d, dict):
            continue
            
        db = d.get('database', '')
        if db:
            db = str(db).upper()
        else:
            db = ''
            
        name = d.get('name', '')
        if name:
            name = str(name).lower()
        else:
            name = ''
        
        # 🟢 TOPOLOGIA/LOCALIZAÇÃO
        if db in ['PHOBIUS', 'TMHMM']:
            # Detecção de transmembrana
            if 'transmembrane' in name or 'tm' in name:
                topology_info['has_transmembrane'] = True
                topology_info['topology_annotations'].append(f"Transmembrana detectado ({db})")
        
        if db in ['SIGNALP_EUK', 'SIGNALP_GRAM_POSITIVE', 'SIGNALP_GRAM_NEGATIVE', 'PHOBIUS']:
            # Detecção de peptídeo sinal
            if 'signal' in name or 'signal peptide' in name:
                topology_info['has_signal_peptide'] = True
                topology_info['topology_annotations'].append(f"Peptídeo sinal detectado ({db})")
        
        # 🟡 CARACTERÍSTICAS ESTRUTURAIS
        if db == 'COILS':
            topology_info['has_coils'] = True
            topology_info['topology_annotations'].append("Regiões desorganizadas (COILS)")
        
        if db == 'MOBIDB_LITE':
            topology_info['has_mobidb'] = True
            topology_info['topology_annotations'].append("Regiões móveis (MOBIDB_LITE)")
    
    # Remover duplicatas mantendo ordem
    topology_info['topology_annotations'] = list(dict.fromkeys(topology_info['topology_annotations']))
    
    return topology_info

# ===== CONVERSÃO PARA MODELO PROTEIN =====

def domains_to_protein(seq_id: str, raw_domains: list, cluster_types: list = None, bgc_region: int = None, start: int = None, end: int = None) -> Protein:
    """Converte lista de domínios brutos em objeto Protein com suporte a múltiplos clusters e região BGC"""
    
    if cluster_types is None:
        cluster_types = []
    elif isinstance(cluster_types, str):
        cluster_types = [cluster_types] if cluster_types else []
    
    if not raw_domains:
        return Protein(
            seq_id=seq_id,
            bgc_region=bgc_region,
            cluster_types=cluster_types if isinstance(cluster_types, list) else ([] if cluster_types is None else [cluster_types]),
            start=start,
            end=end,
            domain_count=0,
            domains=[],
            confidence_level="Nenhum",
            confidence_score=0,
            confidence_level_v2="Nenhum",
            confidence_score_v2=0.0,
            confidence_explainer_v2="Sem hits funcionais/estruturais",
            confidence_breakdown_v2=ConfidenceV2Breakdown(),
            has_transmembrane=False,
            has_signal_peptide=False,
            has_coils=False,
            has_mobidb=False,
            topology_annotations=[]
        )
    
    # Separar domínios reais de topologia/características estruturais
    topology_only_dbs = set(TOPOLOGY + STRUCTURAL_FEATURES)
    
    real_domains = []
    topology_domains = []
    
    for d in raw_domains:
        if not d or not isinstance(d, dict):
            continue
        db = d.get('database', '')
        if db in topology_only_dbs:
            topology_domains.append(d)
        else:
            real_domains.append(d)
    
    # Processar domínios reais - remover duplicatas
    unique_real_domains = {}
    for d in real_domains:
        if not d or not isinstance(d, dict):
            continue
        accession = d.get('accession') or 'UNKNOWN'
        key = (accession, d.get('start'), d.get('end'))
        if key not in unique_real_domains:
            name = d.get('name') or d.get('description') or 'Unknown domain'
            accession = d.get('accession') or 'UNKNOWN'
            db = d.get('database') or 'UNKNOWN'
            databases = [db] if db else ['UNKNOWN']
            
            unique_real_domains[key] = Domain(
                name=name,
                accession=accession,
                databases=databases,
                evalue=str(d.get('evalue') or 'N/A'),
                start=d.get('start'),
                end=d.get('end'),
                is_topology=False,
                description=d.get('description'),
                type=d.get('type'),
                score=d.get('score'),
                interpro_accession=d.get('interpro_accession'),
                interpro_name=d.get('interpro_name')
            )
        else:
            db = d.get('database')
            if db and db not in unique_real_domains[key].databases:
                if unique_real_domains[key].databases:
                    unique_real_domains[key].databases.append(db)
                else:
                    unique_real_domains[key].databases = [db]
    
    # Processar itens de topologia - remover duplicatas
    unique_topology_domains = {}
    for d in topology_domains:
        if not d or not isinstance(d, dict):
            continue
        accession = d.get('accession') or 'UNKNOWN'
        key = (accession, d.get('start'), d.get('end'))
        if key not in unique_topology_domains:
            name = d.get('name') or d.get('description') or 'Unknown'
            accession = d.get('accession') or 'UNKNOWN'
            db = d.get('database') or 'UNKNOWN'
            databases = [db] if db else ['UNKNOWN']
            
            unique_topology_domains[key] = Domain(
                name=name,
                accession=accession,
                databases=databases,
                evalue=str(d.get('evalue') or 'N/A'),
                start=d.get('start'),
                end=d.get('end'),
                is_topology=True,
                description=d.get('description'),
                type=d.get('type'),
                score=d.get('score'),
                interpro_accession=d.get('interpro_accession'),
                interpro_name=d.get('interpro_name')
            )
        else:
            db = d.get('database')
            if db and db not in unique_topology_domains[key].databases:
                if unique_topology_domains[key].databases:
                    unique_topology_domains[key].databases.append(db)
                else:
                    unique_topology_domains[key].databases = [db]
    
    # Combinar: domínios reais primeiro, depois topologia
    real_domains_list = list(unique_real_domains.values())
    topology_domains_list = list(unique_topology_domains.values())
    all_domains_list = real_domains_list + topology_domains_list
    
    confidence = classify_confidence(raw_domains)
    confidence_score = count_confidence_databases(raw_domains)
    confidence_v2, score_v2, explainer_v2, breakdown_v2 = classify_confidence_v2(raw_domains)
    
    # Extrair características topológicas
    topology_features = extract_topology_features(raw_domains)
    
    return Protein(
        seq_id=seq_id,
        bgc_region=bgc_region,
        cluster_types=cluster_types if isinstance(cluster_types, list) else ([] if cluster_types is None else [cluster_types]),
        start=start,
        end=end,
        domain_count=len(real_domains_list),  # Contar APENAS domínios reais
        domains=all_domains_list,  # Incluir TODOS (domínios + topologia)
        confidence_level=confidence,
        confidence_score=confidence_score,
        confidence_level_v2=confidence_v2,
        confidence_score_v2=score_v2,
        confidence_explainer_v2=explainer_v2,
        confidence_breakdown_v2=breakdown_v2,
        has_transmembrane=topology_features['has_transmembrane'],
        has_signal_peptide=topology_features['has_signal_peptide'],
        has_coils=topology_features['has_coils'],
        has_mobidb=topology_features['has_mobidb'],
        topology_annotations=topology_features['topology_annotations']
    )

# ===== DADOS PLACEHOLDER (para teste sem InterProScan) =====

def get_placeholder_proteins(count: int = 5) -> list:
    """Gera proteínas com dados placeholder para teste rápido (incluindo topologia)"""
    proteins_data = [
        {
            'seq_id': 'hyp_1',
            'domains': [
                Domain(name="Kinase domain", accession="PF00069", databases=["PFAM", "SMART"], evalue="1.2e-45", start=10, end=280, description="Protein kinase domain", type="DOMAIN", score=150.5, interpro_accession="IPR000719", interpro_name="Protein kinase domain"),
                Domain(name="ATP-binding", accession="PF00010", databases=["PFAM"], evalue="3.4e-30", start=15, end=150, description="ATP-binding domain", type="BINDING_SITE", score=95.3),
                Domain(name="Protein phosphorylation", accession="PANTHER:PTHR24607", databases=["PANTHER"], evalue="2.1e-50", start=20, end=300, description="Protein phosphorylation family", type="FAMILY", score=180.2),
            ]
        },
        {
            'seq_id': 'hyp_2',
            'domains': [
                Domain(name="Transmembrane domain", accession="PF00001", databases=["PFAM", "SMART"], evalue="5.4e-45", start=50, end=340, description="Transmembrane region", type="DOMAIN"),
                Domain(name="Transmembrane region", accession="TMHMM", databases=["TMHMM"], evalue="N/A", start=60, end=78, description="Predicted transmembrane helix", type="REGION"),
            ]
        },
        {
            'seq_id': 'hyp_3',
            'domains': [
                Domain(name="Signal peptide N-region", accession="SIGNALP", databases=["SIGNALP_EUK"], evalue="N/A", start=1, end=25, description="Signal peptide cleavage site prediction", type="SIGNAL_PEPTIDE"),
            ]
        },
        {
            'seq_id': 'hyp_4',
            'domains': [
                Domain(name="Zinc finger", accession="PF00096", databases=["PFAM"], evalue="1.2e-20", start=5, end=50, description="Zinc finger C2H2 type", type="DOMAIN", interpro_accession="IPR007087", interpro_name="Zinc finger, C2H2"),
                Domain(name="C2H2 motif", accession="SM00355", databases=["SMART"], evalue="3.4e-18", start=8, end=48, description="C2H2-type zinc finger", type="MOTIF"),
                Domain(name="Coil prediction", accession="COILS", databases=["COILS"], evalue="N/A", start=100, end=140, description="Predicted coiled-coil region", type="COILED_COIL"),
            ]
        },
        {
            'seq_id': 'hyp_5',
            'domains': [
                Domain(name="Helicase domain", accession="PF04851", databases=["PFAM", "GENE3D", "SUPERFAMILY"], evalue="2.1e-60", start=100, end=450, description="RNA helicase domain", type="DOMAIN", score=225.8, interpro_accession="IPR001650", interpro_name="Helicase, C-terminal domain"),
                Domain(name="Disordered region", accession="MOBIDB_LITE", databases=["MOBIDB_LITE"], evalue="N/A", start=480, end=520, description="Intrinsically disordered protein region", type="DISORDER"),
            ]
        },
    ]
    
    proteins = []
    for i, data in enumerate(proteins_data[:count]):
        if data['domains']:
            # Converter Domain objects para dicts para análise de topologia
            raw_domains_dicts = []
            for d in data['domains']:
                raw_domains_dicts.append({
                    'database': d.databases[0],  # Usar primeiro banco para placeholder
                    'name': d.name,
                    'accession': d.accession,
                    'evalue': d.evalue,
                    'start': d.start,
                    'end': d.end
                })
            
            # Extrair características topológicas
            topology_features = extract_topology_features(raw_domains_dicts)
            confidence = classify_confidence(raw_domains_dicts)
        else:
            topology_features = {
                'has_transmembrane': False,
                'has_signal_peptide': False,
                'has_coils': False,
                'has_mobidb': False,
                'topology_annotations': []
            }
            confidence = "Nenhum"
        
        protein = Protein(
            seq_id=data['seq_id'],
            domain_count=len(data['domains']),
            domains=data['domains'],
            confidence_level=confidence,
            has_transmembrane=topology_features['has_transmembrane'],
            has_signal_peptide=topology_features['has_signal_peptide'],
            has_coils=topology_features['has_coils'],
            has_mobidb=topology_features['has_mobidb'],
            topology_annotations=topology_features['topology_annotations']
        )
        proteins.append(protein)
    
    return proteins
