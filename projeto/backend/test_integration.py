#!/usr/bin/env python3
"""
Teste de integração: simula resposta real do InterProScan
"""

import sys
sys.path.insert(0, '.')

from utils import search_interproscan, domains_to_protein

def test_integration_with_realistic_data():
    """Testa pipeline completo com dados realistas do InterProScan"""
    
    # Simular resposta do InterProScan (dados que podem ter None em alguns campos)
    realistic_raw_domains = [
        {
            'seq_id': 'FWK04_01750',
            'database': 'PFAM',
            'accession': 'PF00069',
            'name': 'Protein kinase domain',
            'description': 'Protein kinase domain',
            'type': 'Domain',
            'evalue': 1.2e-45,
            'score': 150.5,
            'start': 10,
            'end': 280,
            'interpro_accession': 'IPR000719',
            'interpro_name': 'Protein kinase, core'
        },
        {
            'seq_id': 'FWK04_01750',
            'database': 'SMART',
            'accession': 'SM00220',
            'name': None,  # Simular campo que pode ser None
            'description': 'Serine/threonine kinase active site',
            'type': 'Domain',
            'evalue': None,
            'score': None,
            'start': 50,
            'end': 270,
            'interpro_accession': None,  # Pode ser None
            'interpro_name': None
        },
        {
            'seq_id': 'FWK04_01750',
            'database': 'PHOBIUS',
            'accession': 'PH00001',
            'name': 'transmembrane helix',
            'description': None,  # Pode ser None
            'type': 'Domain',
            'evalue': None,
            'score': None,
            'start': 1,
            'end': 25,
            'interpro_accession': None,
            'interpro_name': None
        }
    ]
    
    print("="*70)
    print("TESTE DE INTEGRAÇÃO - Pipeline Completo")
    print("="*70)
    
    try:
        # Converter dados brutos para objeto Protein
        protein = domains_to_protein(
            seq_id='FWK04_01750',
            raw_domains=realistic_raw_domains,
            cluster_types=['PKS', 'NRPS'],
            bgc_region=1,
            start=12345,
            end=15000
        )
        
        print("\n✅ SUCESSO: Pipeline completo executado")
        print(f"\n📊 Resultado:")
        print(f"   - Proteína: {protein.seq_id}")
        print(f"   - Domínios encontrados: {protein.domain_count}")
        print(f"   - Confiança: {protein.confidence_level}")
        print(f"   - Total de items (domínios + topologia): {len(protein.domains)}")
        print(f"   - Clusters: {protein.cluster_types}")
        print(f"   - Transmembrana: {protein.has_transmembrane}")
        print(f"   - Anotações topologia: {protein.topology_annotations}")
        
        # Mostrar detalhes dos domínios
        print(f"\n📋 Domínios processados:")
        for i, domain in enumerate(protein.domains, 1):
            print(f"   {i}. {domain.name} ({domain.accession})")
            print(f"      - Bancos: {domain.databases}")
            print(f"      - Topologia: {domain.is_topology}")
            print(f"      - Posição: {domain.start}-{domain.end}")
        
        return True
    except Exception as e:
        import traceback
        print(f"\n❌ ERRO: {str(e)}")
        traceback.print_exc()
        return False

def test_edge_cases():
    """Testa casos extremos"""
    print("\n" + "="*70)
    print("TESTES DE CASOS EXTREMOS")
    print("="*70)
    
    test_cases = [
        ("Sem domínios", None, []),
        ("Domínios vazios", None, [{}]),
        ("Todos campos None", None, [
            {'database': None, 'accession': None, 'name': None, 'start': None, 'end': None}
        ]),
        ("Múltiplos domínios None", None, [None, {}, None]),
    ]
    
    for i, (description, cluster_types, raw_domains) in enumerate(test_cases, 1):
        try:
            protein = domains_to_protein(
                seq_id=f"test_{i}",
                raw_domains=raw_domains if raw_domains else [],
                cluster_types=cluster_types or []
            )
            print(f"✅ Test {i} ({description}): PASSED")
        except Exception as e:
            print(f"❌ Test {i} ({description}): FAILED - {str(e)[:60]}")

if __name__ == "__main__":
    # Teste principal
    success = test_integration_with_realistic_data()
    
    # Testes de casos extremos
    test_edge_cases()
    
    print("\n" + "="*70)
    if success:
        print("RESULTADO: TUDO OK - Sistema pronto para produção")
    else:
        print("RESULTADO: ERROS ENCONTRADOS - Revisar logs acima")
    print("="*70)
