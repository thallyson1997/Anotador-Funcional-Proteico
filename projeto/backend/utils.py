"""
Funções utilitárias para análise de proteínas
Integração com InterProScan (EBI) para busca real de domínios
"""

from models import Protein, Domain
import requests
import time

# ===== CONSTANTES DE BANCOS DE DADOS =====
FUNCTIONAL_DOMAINS = [
    'PFAM', 'SMART', 'PROSITE', 'PANTHER', 'PRINTS',
    'PIRSF', 'PIRSR', 'HAMAP', 'TIGERFAMS', 'SFLD', 'CDD'
]

STRUCTURAL_DOMAINS = ['GENE3D', 'SUPERFAMILY']

DOMAIN_DATABASES = FUNCTIONAL_DOMAINS + STRUCTURAL_DOMAINS

TOPOLOGY = [
    'PHOBIUS', 'TMHMM', 'SIGNALP_EUK', 'SIGNALP_GRAM_POSITIVE',
    'SIGNALP_GRAM_NEGATIVE'
]

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
            return []

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
                    return []

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
                    return []

            elif status in ['FAILED', 'ERROR', 'NOT_FOUND']:
                print(f" ⚠️ Status {status}")
                return []
            elif attempt % 10 == 0 and attempt > 0:
                print(".", end="", flush=True)

        print(f" ⏱ Timeout após {max_attempts * poll_interval}s")
        return []

    except requests.Timeout:
        print(" ⚠️ Timeout HTTP")
        return []
    except Exception as e:
        print(f" ⚠️ {type(e).__name__}: {str(e)[:50]}")
        return []

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
    domains_only = [d for d in domains if d.get('database', 'UNKNOWN') in DOMAIN_DATABASES]
    
    if not domains_only:
        return "Nenhum"
    
    unique_dbs = len(set(d['database'] for d in domains_only))
    
    if unique_dbs >= 5:
        return "Alta"
    elif unique_dbs >= 3:
        return "Média"
    elif unique_dbs >= 1:
        return "Baixa"
    else:
        return "Nenhum"

# ===== CONVERSÃO PARA MODELO PROTEIN =====

def domains_to_protein(seq_id: str, raw_domains: list) -> Protein:
    """Converte lista de domínios brutos em objeto Protein"""
    
    if not raw_domains:
        return Protein(
            seq_id=seq_id,
            domain_count=0,
            domains=[],
            confidence_level="Nenhum"
        )
    
    # Remover duplicatas e gerar objetos Domain
    unique_domains = {}
    for d in raw_domains:
        key = (d['accession'], d.get('start'), d.get('end'))
        if key not in unique_domains:
            unique_domains[key] = Domain(
                name=d['name'],
                accession=d['accession'],
                databases=[d['database']],
                confidence=classify_confidence([d]),
                evalue=str(d.get('evalue', 'N/A')),
                start=d.get('start'),
                end=d.get('end')
            )
        else:
            # Adicionar base de dados se não existir
            if d['database'] not in unique_domains[key].databases:
                unique_domains[key].databases.append(d['database'])
    
    domains_list = list(unique_domains.values())
    confidence = classify_confidence(raw_domains)
    
    return Protein(
        seq_id=seq_id,
        domain_count=len(domains_list),
        domains=domains_list,
        confidence_level=confidence
    )

# ===== DADOS PLACEHOLDER (para teste sem InterProScan) =====

def get_placeholder_proteins(count: int = 5) -> list:
    """Gera proteínas com dados placeholder para teste rápido"""
    proteins_data = [
        {
            'seq_id': 'hyp_1',
            'domains': [
                Domain(name="Kinase domain", accession="PF00069", databases=["PFAM", "SMART"], confidence="Alta", evalue="1.2e-45", start=10, end=280),
                Domain(name="ATP-binding", accession="PF00010", databases=["PFAM"], confidence="Média", evalue="3.4e-30", start=15, end=150),
                Domain(name="Protein phosphorylation", accession="PANTHER:PTHR24607", databases=["PANTHER"], confidence="Alta", evalue="2.1e-50", start=20, end=300),
            ]
        },
        {
            'seq_id': 'hyp_2',
            'domains': [
                Domain(name="Transmembrane domain", accession="PF00001", databases=["PFAM", "SMART"], confidence="Alta", evalue="5.4e-45", start=50, end=340),
            ]
        },
        {
            'seq_id': 'hyp_3',
            'domains': []
        },
        {
            'seq_id': 'hyp_4',
            'domains': [
                Domain(name="Zinc finger", accession="PF00096", databases=["PFAM"], confidence="Baixa", evalue="1.2e-20", start=5, end=50),
                Domain(name="C2H2 motif", accession="SM00355", databases=["SMART"], confidence="Baixa", evalue="3.4e-18", start=8, end=48),
            ]
        },
        {
            'seq_id': 'hyp_5',
            'domains': [
                Domain(name="Helicase domain", accession="PF04851", databases=["PFAM", "GENE3D", "SUPERFAMILY"], confidence="Alta", evalue="2.1e-60", start=100, end=450),
            ]
        },
    ]
    
    proteins = []
    for i, data in enumerate(proteins_data[:count]):
        confidence = classify_confidence([{'database': db} for d in data['domains'] for db in d.databases]) if data['domains'] else "Nenhum"
        protein = Protein(
            seq_id=data['seq_id'],
            domain_count=len(data['domains']),
            domains=data['domains'],
            confidence_level=confidence
        )
        proteins.append(protein)
    
    return proteins
