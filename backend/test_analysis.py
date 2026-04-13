#!/usr/bin/env python3
"""
Script de teste para validar as correções de NoneType errors
"""

import sys
sys.path.insert(0, '.')

from utils import extract_topology_features, classify_confidence, domains_to_protein

# ===== TESTES =====

def test_extract_topology_features_with_none():
    """Testa extract_topology_features com dados None"""
    test_cases = [
        [],
        None,
        [None],
        [{}],
        [{'database': None, 'name': None}],
        [{'database': 'PHOBIUS', 'name': None}],
        [{'database': None, 'name': 'transmembrane'}],
        [{'database': 'PHOBIUS', 'name': 'transmembrane'}],
    ]
    
    for i, test_data in enumerate(test_cases):
        try:
            result = extract_topology_features(test_data if test_data is not None else [])
            print(f"✅ Test {i+1}: extract_topology_features PASSED")
        except AttributeError as e:
            print(f"❌ Test {i+1}: extract_topology_features FAILED - {e}")
        except Exception as e:
            print(f"⚠️ Test {i+1}: extract_topology_features ERROR - {e}")

def test_classify_confidence_with_none():
    """Testa classify_confidence com dados None"""
    test_cases = [
        [],
        None,
        [None],
        [{}],
        [{'database': None}],
        [{'database': 'PFAM'}],
        [{'database': 'PFAM'}, {'database': None}],
    ]
    
    for i, test_data in enumerate(test_cases):
        try:
            result = classify_confidence(test_data if test_data is not None else [])
            print(f"✅ Test {i+1}: classify_confidence PASSED (result={result})")
        except AttributeError as e:
            print(f"❌ Test {i+1}: classify_confidence FAILED - {e}")
        except Exception as e:
            print(f"⚠️ Test {i+1}: classify_confidence ERROR - {e}")

def test_domains_to_protein_with_none():
    """Testa domains_to_protein com dados None"""
    test_cases = [
        [],
        [None],
        [{}],
        [{'database': None, 'accession': None, 'name': None}],
        [{'database': 'PFAM', 'accession': 'PF00069', 'name': 'Kinase'}],
    ]
    
    for i, test_data in enumerate(test_cases):
        try:
            result = domains_to_protein(
                seq_id=f"test_{i}",
                raw_domains=test_data,
                cluster_types=[],
                bgc_region=None,
                start=None,
                end=None
            )
            print(f"✅ Test {i+1}: domains_to_protein PASSED")
        except AttributeError as e:
            print(f"❌ Test {i+1}: domains_to_protein FAILED - {e}")
        except Exception as e:
            print(f"⚠️ Test {i+1}: domains_to_protein ERROR - {e}")

if __name__ == "__main__":
    print("="*70)
    print("TESTANDO PROTECAO CONTRA NONETYPE ERRORS")
    print("="*70)
    
    print("\n[TEST] Testing extract_topology_features...")
    test_extract_topology_features_with_none()
    
    print("\n[TEST] Testing classify_confidence...")
    test_classify_confidence_with_none()
    
    print("\n[TEST] Testing domains_to_protein...")
    test_domains_to_protein_with_none()
    
    print("\n" + "="*70)
    print("TESTES CONCLUIDOS")
    print("="*70)
