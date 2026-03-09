// ===== CONFIGURAÇÃO DA API =====
const API_BASE_URL = ''; // Usar requisições relativas (mesma porta)
// ===== NOTIFICAÇÕES =====
function showNotification(message, type = 'error', duration = 5000) {
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notification-message');
    
    // Atualizar conteúdo e classe
    notificationMessage.textContent = message;
    notification.className = `notification active ${type}`;
    
    // Auto-fechar após duração (se duration > 0)
    if (duration > 0) {
        setTimeout(() => {
            closeNotification();
        }, duration);
    }
}

function closeNotification() {
    const notification = document.getElementById('notification');
    notification.classList.remove('active');
}
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
        showNotification('Por favor, insira uma sequência proteica válida.', 'error');
        return;
    }
    
    if (!email || !validateEmail(email)) {
        showNotification('Por favor, insira um email válido.', 'error');
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
        showNotification('Erro ao processar sequência: ' + error.message, 'error');
        goToPage('page-input');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Analisar Sequência';
    }
}

// ===== VARIÁVEIS GLOBAIS PARA MODAL =====
let currentAntismashFile = null;
let currentAntismashEmail = null;
let currentProteins = [];

// ===== MODAL FUNCTIONS =====
function closeProteinModal() {
    document.getElementById('modal-proteins').classList.remove('active');
    currentAntismashFile = null;
    currentAntismashEmail = null;
    currentProteins = [];
}

function toggleAllProteinCheckboxes(checked) {
    const checkboxes = document.querySelectorAll('.protein-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = checked;
    });
}

function showProteinModal(proteins, filename) {
    const modal = document.getElementById('modal-proteins');
    const countText = document.getElementById('proteins-count-text');
    const tableContainer = document.getElementById('proteins-table-container');
    const tableBody = document.getElementById('proteins-tbody');
    const noMessage = document.getElementById('no-proteins-message');
    const btnAnalyze = document.getElementById('btn-analyze-selected');
    
    currentProteins = proteins;
    
    if (proteins.length === 0) {
        countText.textContent = '❌ Nenhuma proteína hipotética foi encontrada.';
        tableContainer.style.display = 'none';
        noMessage.style.display = 'block';
        btnAnalyze.style.display = 'none';
    } else {
        countText.textContent = `✅ Encontradas ${proteins.length} proteínas hipotéticas`;
        tableContainer.style.display = 'block';
        noMessage.style.display = 'none';
        btnAnalyze.style.display = 'block';
        
        // Preencher tabela com checkboxes (desmarcados por padrão)
        tableBody.innerHTML = '';
        proteins.forEach((protein, idx) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="text-align: center;"><input type="checkbox" class="protein-checkbox" data-index="${idx}"></td>
                <td>${protein.index}</td>
                <td>${protein.locus_tag || '-'}</td>
                <td>${protein.product}</td>
                <td>${protein.sequence_length}</td>
            `;
            tableBody.appendChild(row);
        });
    }
    
    modal.classList.add('active');
}

async function analyzeSelectedProteins() {
    // Coletar índices das proteínas selecionadas
    const checkboxes = document.querySelectorAll('.protein-checkbox:checked');
    const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
    
    if (selectedIndices.length === 0) {
        showNotification('Selecione pelo menos uma proteína para análise', 'error');
        return;
    }
    
    // Guardar valores ANTES de fechar o modal (que zera as variáveis)
    const fileToAnalyze = currentAntismashFile;
    const emailToUse = currentAntismashEmail;
    
    console.log('Debug analyzeSelectedProteins:', {
        fileAvailable: !!fileToAnalyze,
        fileName: fileToAnalyze?.name || 'null',
        emailAvailable: !!emailToUse,
        email: emailToUse || 'null',
        selectedIndicesCount: selectedIndices.length
    });
    
    // Se não temos arquivo/email, notificar mas continuar de qualquer forma
    // pois a análise pode já estar em andamento no backend
    if (!fileToAnalyze && emailToUse) {
        console.warn('Arquivo não disponível, mas email existe. Prosseguindo...');
    }
    
    closeProteinModal();
    goToPage('page-loading');
    
    try {
        // Chamar endpoint de análise com as proteínas selecionadas
        const formData = new FormData();
        if (fileToAnalyze) {
            formData.append('file', fileToAnalyze);
        }
        if (emailToUse) {
            formData.append('email', emailToUse);
        }
        formData.append('selected_indices', JSON.stringify(selectedIndices));
        
        // Log para debugging
        console.log('Enviando para backend:', {
            fileAvailable: !!fileToAnalyze,
            email: emailToUse,
            selectedIndices: selectedIndices,
            proteinsCount: selectedIndices.length
        });
        
        // Atualizar progresso
        updateProgress(25, 2, 'Enviando análise para o servidor...');
        
        const response = await fetch(`${API_BASE_URL}/api/analyze-antismash-selected`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.log('Erro do backend:', errorData);
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        updateProgress(100, 4, 'Análise concluída com sucesso!', true);
        await sleep(1000);
        displayResults(result);
        goToPage('page-results');
        
    } catch (error) {
        console.error('API Error:', error);
        updateProgress(0, 4, `Erro: ${error.message}`, false);
        document.getElementById('step-4-status').textContent = '❌';
        document.getElementById('step-4-status').classList.add('error');
        await sleep(2000);
        goToPage('page-input');
        showNotification(error.message || 'Erro ao analisar', 'error');
    }
}

// ===== SUBMIT ANTISMASH =====
async function submitAntismash() {
    const file = document.getElementById('antismash-file').files[0];
    const email = document.getElementById('email-antismash').value.trim();
    const filterByBGC = document.getElementById('filter-by-bgc').checked;
    
    // Validação
    if (!file) {
        showNotification('Por favor, selecione um arquivo para upload.', 'error');
        return;
    }
    
    if (file.size > 500 * 1024 * 1024) {
        showNotification('Arquivo muito grande (máximo 500 MB).', 'error');
        return;
    }
    
    if (!email || !validateEmail(email)) {
        showNotification('Por favor, insira um email válido.', 'error');
        return;
    }
    
    // Mostrar aviso se filtro desativado
    if (!filterByBGC) {
        showNotification('⚠️ Filtro BGC desativado - a análise pode demorar bastante tempo!', 'warning');
    }
    
    // Desabilitar botão
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Contando proteínas...';
    
    try {
        // Guardar arquivo e email para uso posterior
        currentAntismashFile = file;
        currentAntismashEmail = email;
        
        // Contar proteínas
        const formData = new FormData();
        formData.append('file', file);
        formData.append('filter_by_bgc', filterByBGC ? 'true' : 'false');
        
        const response = await fetch(`${API_BASE_URL}/api/count-hypothetical-proteins`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Mostrar modal com contagem
        showProteinModal(result.proteins || [], file.name);
        
    } catch (error) {
        console.error('Erro:', error);
        showNotification('Erro ao contar proteínas: ' + error.message, 'error');
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
        showNotification(error.message || 'Erro ao processar sequência.', 'error');
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
        showNotification(error.message || 'Erro ao processar arquivo.', 'error');
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
// ===== CATEGORIZAÇÃO DE DOMÍNIOS =====
function getDatabaseCategory(database) {
    const db = database.toUpperCase().trim();
    
    // Domínios Funcionais - AZUL
    if (['PFAM', 'SMART', 'PROSITE', 'PANTHER', 'PRINTS', 'PIRSF', 'PIRSR', 'HAMAP', 'TIGERFAMS', 'SFLD', 'CDD', 'NCBIFAM'].includes(db)) {
        return { 
            emoji: '🔵', 
            category: 'Domínios Funcionais',
            color: '#0052cc',
            bgColor: '#ddf1ff',
            borderColor: '#0052cc',
            accentColor: 'rgba(0, 82, 204, 0.1)'
        };
    } 
    // Domínios Estruturais - VERMELHO
    else if (['GENE3D', 'SUPERFAMILY'].includes(db)) {
        return { 
            emoji: '🟢', 
            category: 'Domínios Estruturais',
            color: '#cc0000',
            bgColor: '#ffe6e6',
            borderColor: '#cc0000',
            accentColor: 'rgba(204, 0, 0, 0.1)'
        };
    } 
    // Topologia/Localização - VERDE
    else if (['PHOBIUS', 'TMHMM', 'SIGNALP_EUK', 'SIGNALP_GRAM_POSITIVE', 'SIGNALP_GRAM_NEGATIVE'].includes(db)) {
        return { 
            emoji: '🔷', 
            category: 'Topologia/Localização',
            color: '#009900',
            bgColor: '#e6ffe6',
            borderColor: '#009900',
            accentColor: 'rgba(0, 153, 0, 0.1)'
        };
    } 
    // Características Estruturais - AMARELO
    else if (['COILS', 'MOBIDB_LITE'].includes(db)) {
        return { 
            emoji: '🔶', 
            category: 'Características Estruturais',
            color: '#cc9900',
            bgColor: '#fff9e6',
            borderColor: '#cc9900',
            accentColor: 'rgba(204, 153, 0, 0.1)'
        };
    } 
    // Outros/Não Categorizados - BRANCO/CINZA
    else {
        return { 
            emoji: '⚪', 
            category: 'Outros/Não Categorizados',
            color: '#333333',
            bgColor: '#f5f5f5',
            borderColor: '#999999',
            accentColor: 'rgba(51, 51, 51, 0.05)'
        };
    }
}

// ===== VERIFICA SE BANCO PERTENCE A DOMÍNIOS FUNCIONAIS OU ESTRUTURAIS =====
function isFunctionalOrStructuralDomain(database) {
    const db = database.toUpperCase().trim();
    const functionalDomains = ['PFAM', 'SMART', 'PROSITE', 'PANTHER', 'PRINTS', 'PIRSF', 'PIRSR', 'HAMAP', 'TIGERFAMS', 'SFLD', 'CDD', 'NCBIFAM'];
    const structuralDomains = ['GENE3D', 'SUPERFAMILY'];
    
    return functionalDomains.includes(db) || structuralDomains.includes(db);
}

// ===== DETERMINA CATEGORIA PREDOMINANTE DE UM DOMÍNIO =====
function getDomainPrimaryCategory(databases) {
    if (!databases || databases.length === 0) {
        return getDatabaseCategory('OTHER');
    }
    // Retorna a categoria do primeiro banco de dados
    return getDatabaseCategory(databases[0]);
}

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
        
        // BGC Region
        html += `
            <div class="protein-info-row">
                <div class="protein-info-label">Região BGC:</div>
                <div class="protein-info-value">${protein.bgc_region ? `#${protein.bgc_region}` : 'N/A'}</div>
            </div>
        `;
        
        // Clusters
        html += `
            <div class="protein-info-row">
                <div class="protein-info-label">Cluster(s):</div>
                <div class="protein-info-value">${protein.cluster_types && protein.cluster_types.length > 0 ? protein.cluster_types.join(', ') : 'Nenhum cluster'}</div>
            </div>
        `;
        
        // Localização
        html += `
            <div class="protein-info-row">
                <div class="protein-info-label">Localização:</div>
                <div class="protein-info-value">${(protein.start !== null && protein.start !== undefined && protein.end !== null && protein.end !== undefined) ? `${protein.start} - ${protein.end} pb` : 'N/A'}</div>
            </div>
        `;
        
        // Topologia
        const topologyFlags = [];
        if (protein.has_transmembrane) topologyFlags.push('🧬 Transmembrana');
        if (protein.has_signal_peptide) topologyFlags.push('📍 Signal Peptide');
        if (protein.has_coils) topologyFlags.push('🔄 Coils');
        if (protein.has_mobidb) topologyFlags.push('🔲 Disorder');
        
        html += `
            <div class="protein-info-row">
                <div class="protein-info-label">Topologia:</div>
                <div class="protein-info-value">${topologyFlags.length > 0 ? topologyFlags.join(', ') : 'Nenhuma característica detectada'}</div>
            </div>
        `;
        
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
            // Separar domínios reais (apenas funcionais e estruturais, não topologia nem não-categorizados)
            const functionalDomains = ['PFAM', 'SMART', 'PROSITE', 'PANTHER', 'PRINTS', 'PIRSF', 'PIRSR', 'HAMAP', 'TIGERFAMS', 'SFLD', 'CDD', 'NCBIFAM'];
            const structuralDomains = ['GENE3D', 'SUPERFAMILY'];
            const allRealDomains = [...functionalDomains, ...structuralDomains];
            
            const realDomains = protein.domains.filter(d => {
                if (!d.databases || d.databases.length === 0) return false;
                // Contar apenas se tem pelo menos um banco em domínios funcionais/estruturais
                return d.databases.some(db => allRealDomains.includes(db.toUpperCase()));
            });
            
            // Contar bancos de dados únicos para domínios reais
            const realDomainsDBs = new Set();
            realDomains.forEach(domain => {
                if (domain.databases && Array.isArray(domain.databases)) {
                    domain.databases.forEach(db => {
                        if (allRealDomains.includes(db.toUpperCase())) {
                            realDomainsDBs.add(db);
                        }
                    });
                }
            });
            
            const totalResults = protein.domains.length;
            const totalRealDomains = realDomains.length;
            const totalRealDatabases = realDomainsDBs.size;
            
            html += `
                <div class="domains-section">
                    <h4>${totalResults} Resultados Encontrados</h4>
                    <div style="background-color: #f8f9fa; padding: 12px 14px; border-radius: 6px; margin-bottom: 12px; font-size: 0.95em;">
            `;
            
            if (totalRealDomains > 0) {
                html += `<div style="color: #555;">🔵 Foram encontrados ${totalRealDomains} domínio${totalRealDomains !== 1 ? 's' : ''} em ${totalRealDatabases} banco${totalRealDatabases !== 1 ? 's' : ''} de dados</div>`;
            } else {
                html += `<div style="color: #555;">Nenhum domínio identificado em bancos de dados.</div>`;
            }
            
            html += `
                    </div>
                    <div class="domains-list" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            `;
            
            // Agrupar domínios por banco de dados
            const domainsByDb = {};
            protein.domains.forEach(domain => {
                if (domain.databases && domain.databases.length > 0) {
                    const primaryDb = domain.databases[0];
                    if (!domainsByDb[primaryDb]) {
                        domainsByDb[primaryDb] = [];
                    }
                    domainsByDb[primaryDb].push(domain);
                }
            });
            
            // Renderizar agrupado por banco de dados (3 colunas por linha)
            Object.entries(domainsByDb).forEach(([dbName, domains]) => {
                const primaryCategory = getDatabaseCategory(dbName);
                
                html += `
                    <div style="
                        background-color: ${primaryCategory.bgColor};
                        border-left: 4px solid ${primaryCategory.color};
                        border: 1px solid ${primaryCategory.borderColor};
                        border-radius: 6px;
                        padding: 12px;
                    ">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; border-bottom: 1px solid ${primaryCategory.borderColor}; padding-bottom: 8px;">
                            <span style="font-size: 1.1em;">${primaryCategory.emoji}</span>
                            <strong style="color: ${primaryCategory.color}; flex: 1;">${dbName}</strong>
                            <span style="background-color: ${primaryCategory.color}20; color: ${primaryCategory.color}; border: 1px solid ${primaryCategory.color}; border-radius: 4px; padding: 2px 8px; font-size: 0.75em; font-weight: 600;">${primaryCategory.category}</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                `;
                
                domains.forEach(domain => {
                    html += `
                        <div style="padding: 8px; background-color: rgba(255,255,255,0.6); border-radius: 4px; border-left: 2px solid ${primaryCategory.color};">
                            <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px; margin-bottom: 4px;">
                                <strong style="color: ${primaryCategory.color}; word-break: break-word; flex: 1;">${domain.name}</strong>
                                <span style="font-size: 0.75em; color: #666; white-space: nowrap;">${domain.accession}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 0.85em; color: #555;">
                                <span><strong>E-value:</strong> ${domain.evalue}</span>
                                <span><strong>Posição:</strong> ${domain.start}-${domain.end}</span>
                            </div>
                        </div>
                    `;
                });
                
                html += `
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
    
    // Event listeners para modal de proteins
    const modalProteinBtn = document.getElementById('btn-cancel-proteins');
    if (modalProteinBtn) {
        modalProteinBtn.addEventListener('click', closeProteinModal);
    }
    
    const modalCloseBtn = document.querySelector('#modal-proteins .modal-close');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeProteinModal);
    }
    
    // Página inicial começa com a home (verificar no HTML que page-home tem class active)
});
