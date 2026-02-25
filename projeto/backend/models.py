from pydantic import BaseModel
from typing import List, Optional

# ===== DOMAIN MODEL =====
class Domain(BaseModel):
    name: str
    accession: str
    databases: List[str]
    confidence: str
    evalue: str
    start: int
    end: int

# ===== PROTEIN MODEL =====
class Protein(BaseModel):
    seq_id: str
    protein_name: Optional[str] = None
    region: Optional[str] = None
    cluster_types: List[str] = []  # Múltiplos clusters possíveis
    domain_count: int
    domains: List[Domain]
    confidence_level: str
    # 🟢 Topologia/Localização
    has_transmembrane: bool = False
    has_signal_peptide: bool = False
    # 🟡 Características Estruturais
    has_coils: bool = False
    has_mobidb: bool = False
    # Resumo das anotações de topologia
    topology_annotations: List[str] = []

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
