// ===== CONFIGURAÇÃO DA API =====
const API_BASE_URL = ''; // Usar requisições relativas (mesma porta)

// ===== NAVIGATION =====
function goToPage(pageId) {
    // Ocultar todas as páginas
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
    
    // Mostrar página selecionada
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');
        window.scrollTo(0, 0);
    }
}

// ===== INPUT OPTIONS =====
function switchOption(optionType) {
    // Apenas marca qual opção está selecionada (ambas são sempre mostradas)
    const radioSeq = document.getElementById('radio-sequence');
    const radioAntismash = document.getElementById('radio-antismash');
    
    if (optionType === 'sequence') {
        radioSeq.checked = true;
    } else if (optionType === 'antismash') {
        radioAntismash.checked = true;
    }
}

// ===== FILE INPUT HANDLER =====
document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('antismash-file');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const fileInfo = document.getElementById('file-info');
                const fileSize = (file.size / (1024 * 1024)).toFixed(2); // Converter para MB
                fileInfo.innerHTML = `<p>✅ Arquivo selecionado: ${file.name} (${fileSize} MB)</p>`;
                fileInfo.classList.remove('hidden');
            }
        });
    }
});

// ===== VALIDAÇÃO =====
function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

function cleanSequence(sequence) {
    // Remove espaços, quebras de linha, números e caracteres especiais
    return sequence
        .toUpperCase()
        .replace(/[\s\d\-*]/g, '')
        .trim();
}

// ===== SUBMIT SEQUENCE =====
async function submitSequence() {
    const seqId = document.getElementById('seq-id').value.trim() || `seq_${Date.now()}`;
    const sequence = cleanSequence(document.getElementById('protein-sequence').value);
    const email = document.getElementById('email-seq').value.trim();
    
    // Validação
    if (!sequence) {
        alert('❌ Por favor, insira uma sequência proteica válida.');
        return;
    }
    
    if (!email || !validateEmail(email)) {
        alert('❌ Por favor, insira um email válido.');
        return;
    }
    
    // Desabilitar botão
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Processando...';
    
    try {
        // Ir para página de loading
        goToPage('page-loading');
        
        // Simular análise (substituir por chamada API real depois)
        await analyzeSequence(seqId, sequence, email);
        
    } catch (error) {
        console.error('Erro:', error);
        alert('❌ Erro ao processar sequência: ' + error.message);
        goToPage('page-input');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Analisar Sequência';
    }
}

// ===== SUBMIT ANTISMASH =====
async function submitAntismash() {
    const file = document.getElementById('antismash-file').files[0];
    const email = document.getElementById('email-antismash').value.trim();
    
    // Validação
    if (!file) {
        alert('❌ Por favor, selecione um arquivo para upload.');
        return;
    }
    
    if (file.size > 500 * 1024 * 1024) { // 500 MB
        alert('❌ Arquivo muito grande (máximo 500 MB).');
        return;
    }
    
    if (!email || !validateEmail(email)) {
        alert('❌ Por favor, insira um email válido.');
        return;
    }
    
    // Desabilitar botão
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Carregando...';
    
    try {
        // Ir para página de loading
        goToPage('page-loading');
        
        // Simular análise (substituir por chamada API real depois)
        await analyzeAntismash(file, email);
        
    } catch (error) {
        console.error('Erro:', error);
        alert('❌ Erro ao processar arquivo: ' + error.message);
        goToPage('page-input');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Carregar e Analisar';
    }
}

// ===== SIMULATE SEQUENCE ANALYSIS =====
async function analyzeSequence(seqId, sequence, email) {
    console.log('Analisando sequência:', { seqId, sequence: sequence.substring(0, 50) + '...', email });
    
    // Etapa 1: Validação local
    updateProgress(10, 1, 'Validando sequência...');
    await sleep(500);
    updateProgress(20, 1, 'Sequência validada com sucesso!', true);
    
    // Pular etapa 2 (identificar proteínas hipotéticas)
    updateProgress(20, 2, 'Não aplicável para sequência única', true);
    
    // Etapa 3: Consultar API
    updateProgress(40, 3, 'Enviando sequência para análise...', false);
    
    try {
        const result = await callAPI('/api/predict-domains', 'POST', {
            seq_id: seqId,
            sequence: sequence,
            email: email
        });
        
        updateProgress(70, 3, 'Resultado recebido do servidor', true);
        
        // Etapa 4: Processar resultados
        updateProgress(85, 4, 'Processando dados...', false);
        await sleep(500);
        updateProgress(100, 4, 'Análise concluída!', true);
        
        await sleep(1000);
        displayResults(result);
        goToPage('page-results');
    } catch (error) {
        console.error('API Error:', error);
        updateProgress(0, 3, `Erro na consulta: ${error.message}`, false);
        document.getElementById('step-3-status').textContent = '❌';
        document.getElementById('step-3-status').classList.add('error');
        await sleep(2000);
        goToPage('page-input');
        alert('❌ Erro ao processar sequência. Verifique a conexão com o servidor.');
    }
}

// ===== SIMULATE ANTISMASH ANALYSIS =====
async function analyzeAntismash(file, email) {
    console.log('Analisando antiSMASH:', { file: file.name, email });
    
    // Etapa 1: Enviar arquivo
    updateProgress(15, 1, `Enviando arquivo ${file.name}...`);
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${API_BASE_URL}/api/upload-antismash`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        updateProgress(40, 1, 'Arquivo processado com sucesso!', true);
        
        // Etapa 2: Identificar proteínas hipotéticas
        updateProgress(45, 2, `Encontradas ${result.proteins_analyzed} proteínas...`, false);
        await sleep(800);
        updateProgress(60, 2, 'Proteínas hipotéticas identificadas!', true);
        
        // Etapa 3: Consultar bancos de dados
        updateProgress(65, 3, 'Consultando bancos de dados...', false);
        await sleep(1000);
        updateProgress(85, 3, `${result.proteins_with_domains} proteínas com domínios identificados!`, true);
        
        // Etapa 4: Montar resultados
        updateProgress(90, 4, 'Montando relatório final...', false);
        await sleep(500);
        updateProgress(100, 4, 'Análise concluída com sucesso!', true);
        
        await sleep(1000);
        displayResults(result);
        goToPage('page-results');
        
    } catch (error) {
        console.error('API Error:', error);
        updateProgress(0, 1, `Erro: ${error.message}`, false);
        document.getElementById('step-1-status').textContent = '❌';
        document.getElementById('step-1-status').classList.add('error');
        await sleep(2000);
        goToPage('page-input');
        alert('❌ Erro ao processar arquivo. Verifique a conexão com o servidor.');
    }
}

// ===== UPDATE PROGRESS =====
function updateProgress(percentage, stepNumber, description, isDone = false) {
    // Atualizar barra de progresso
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    progressFill.style.width = percentage + '%';
    progressText.textContent = percentage + '%';
    
    // Atualizar status do passo
    const stepElement = document.getElementById(`step-${stepNumber}`);
    const stepDescription = document.getElementById(`step-${stepNumber}-desc`);
    const stepStatus = document.getElementById(`step-${stepNumber}-status`);
    
    if (stepDescription) {
        stepDescription.textContent = description;
    }
    
    if (isDone) {
        stepStatus.textContent = '✅';
        stepStatus.classList.add('done');
    } else {
        stepStatus.textContent = '⏳';
        stepStatus.classList.remove('done');
    }
}

// ===== DISPLAY RESULTS =====
function displayResults(data) {
    const resultsContainer = document.getElementById('results-content');
    let html = '';
    
    // Header
    html += `
        <div class="results-header">
            <h2>✅ Análise Concluída com Sucesso!</h2>
            <p>Confira os resultados abaixo</p>
        </div>
    `;
    
    // Stats
    if (data.type === 'antismash') {
        html += `
            <div class="results-stats">
                <div class="stat-card">
                    <div class="stat-number">${data.proteins_analyzed}</div>
                    <div class="stat-label">Proteínas Analisadas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${data.proteins_with_domains}</div>
                    <div class="stat-label">Com Domínios Identificados</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${data.proteins.length}</div>
                    <div class="stat-label">Total de Resultados</div>
                </div>
            </div>
        `;
    } else {
        const proteinCount = data.proteins.length;
        const domainsTotal = data.proteins.reduce((sum, p) => sum + p.domain_count, 0);
        
        html += `
            <div class="results-stats">
                <div class="stat-card">
                    <div class="stat-number">${proteinCount}</div>
                    <div class="stat-label">Sequência(s) Analisada(s)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${domainsTotal}</div>
                    <div class="stat-label">Domínios Encontrados</div>
                </div>
            </div>
        `;
    }
    
    // Proteins
    html += '<div class="proteins-list">';
    
    data.proteins.forEach(protein => {
        html += `
            <div class="protein-card">
                <h3>${protein.seq_id}</h3>
                
                <div class="protein-info">
        `;
        
        if (protein.protein_name) {
            html += `
                <div class="protein-info-row">
                    <div class="protein-info-label">Nome:</div>
                    <div class="protein-info-value">${protein.protein_name}</div>
                </div>
            `;
        }
        
        if (protein.region) {
            html += `
                <div class="protein-info-row">
                    <div class="protein-info-label">Região:</div>
                    <div class="protein-info-value">${protein.region}</div>
                </div>
            `;
        }
        
        if (protein.cluster_type) {
            html += `
                <div class="protein-info-row">
                    <div class="protein-info-label">Tipo BGC:</div>
                    <div class="protein-info-value">${protein.cluster_type}</div>
                </div>
            `;
        }
        
        // Confidence Badge
        const confidenceClass = `confidence-${protein.confidence_level.toLowerCase().replace(' ', '-')}`;
        html += `
            <div class="protein-info-row">
                <div class="protein-info-label">Confiança:</div>
                <div class="protein-info-value">
                    <span class="confidence-badge ${confidenceClass}">
                        ${protein.confidence_level}
                    </span>
                </div>
            </div>
        `;
        
        html += `
                </div>
        `;
        
        // Domains
        if (protein.domains && protein.domains.length > 0) {
            html += `
                <div class="domains-section">
                    <h4>Domínios Identificados (${protein.domains.length})</h4>
                    <div class="domains-list">
            `;
            
            protein.domains.forEach(domain => {
                html += `
                    <div class="domain-item">
                        <div class="domain-name">${domain.name}</div>
                        <div class="domain-details">
                            <div class="domain-details-row">
                                <span><strong>Accession:</strong> ${domain.accession}</span>
                            </div>
                            <div class="domain-details-row">
                                <span><strong>E-value:</strong> ${domain.evalue}</span>
                                <span><strong>Posição:</strong> ${domain.start}-${domain.end}</span>
                            </div>
                            <div style="margin-top: 8px;">
                                <strong style="font-size: 0.9em;">Encontrado em:</strong>
                                <div style="margin-top: 4px;">
                `;
                
                domain.databases.forEach(db => {
                    html += `<span class="domain-db">${db}</span>`;
                });
                
                html += `
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="domains-section">
                    <p style="color: var(--color-text-lighter); font-style: italic;">
                        Nenhum domínio identificado em bancos de dados.
                    </p>
                </div>
            `;
        }
        
        html += '</div>';
    });
    
    html += '</div>';
    
    resultsContainer.innerHTML = html;
}

// ===== HELPER FUNCTION =====
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== API CALLS =====
async function callAPI(endpoint, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/upload-antismash`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Upload Error:', error);
        throw error;
    }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('Anotador Proteico Frontend - Inicializado');
    // Página inicial começa com a home (verificar no HTML que page-home tem class active)
});
