from pydantic import BaseModel
from typing import List, Optional

# ===== DOMAIN MODEL =====
class Domain(BaseModel):
    name: str
    accession: str
    databases: Optional[List[str]] = None
    evalue: str
    start: Optional[int] = None
    end: Optional[int] = None
    is_topology: bool = False  # True se for topologia/característica, False se for domínio real
    # Campos adicionais do InterProScan
    description: Optional[str] = None
    type: Optional[str] = None
    score: Optional[float] = None
    interpro_accession: Optional[str] = None
    interpro_name: Optional[str] = None


class ConfidenceV2Breakdown(BaseModel):
    unique_databases: int = 0
    total_hits: int = 0
    good_hits: int = 0
    strong_hits: int = 0
    interpro_hits: int = 0
    cluster_count: int = 0
    clustered_hits: int = 0
    bucket_count: int = 0
    multi_support_buckets: int = 0
    consensus_percent: float = 0.0
    db_score: float = 0.0
    quality_score: float = 0.0
    interpro_score: float = 0.0
    consensus_score: float = 0.0

# ===== PROTEIN MODEL =====
class Protein(BaseModel):
    seq_id: str
    protein_name: Optional[str] = None
    region: Optional[str] = None
    bgc_region: Optional[int] = None  # Número da região BGC
    bgc_region_display_label: Optional[str] = None  # Ex: "VRZE01000001.1 - Region 1"
    cluster_types: List[str] = []  # Múltiplos clusters possíveis
    start: Optional[int] = None  # Posição inicial no genoma
    end: Optional[int] = None  # Posição final no genoma
    domain_count: int
    domains: List[Domain]
    confidence_level: str
    confidence_score: Optional[int] = None
    confidence_level_v2: Optional[str] = None
    confidence_score_v2: Optional[float] = None
    confidence_explainer_v2: Optional[str] = None
    confidence_breakdown_v2: Optional[ConfidenceV2Breakdown] = None
    # 🟢 Topologia/Localização
    has_transmembrane: bool = False
    has_signal_peptide: bool = False
    # 🟡 Características Estruturais
    has_coils: bool = False
    has_mobidb: bool = False
    # Resumo das anotações de topologia
    topology_annotations: List[str] = []
    # Sequência de aminoácidos
    sequence: Optional[str] = None

# ===== SEQUENCE ANALYSIS REQUEST =====
class SequenceAnalysisRequest(BaseModel):
    seq_id: str
    sequence: str
    email: str

# ===== ANTISMASH ANALYSIS RESPONSE =====
class AntismashAnalysisResponse(BaseModel):
    type: str = "antismash"
    file_name: str
    proteins_analyzed: int
    proteins_with_domains: int
    proteins: List[Protein]

# ===== SEQUENCE ANALYSIS RESPONSE =====
class SequenceAnalysisResponse(BaseModel):
    type: str = "sequence"
    proteins: List[Protein]

# ===== HEALTH CHECK =====
class HealthResponse(BaseModel):
    status: str
    version: str
