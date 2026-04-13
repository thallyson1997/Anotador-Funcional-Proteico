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

let currentDisplayedProteins = [];
let currentAnalysisData = null;

function normalizeApiErrorMessage(error) {
    const message = String(error?.message || error || '').trim();
    const lowerMessage = message.toLowerCase();

    if (
        lowerMessage.includes('failed to fetch') ||
        lowerMessage.includes('networkerror') ||
        lowerMessage.includes('load failed')
    ) {
        return 'Nao foi possivel conectar a API no momento. Tente novamente.';
    }

    if (
        lowerMessage.includes('interproscan') ||
        lowerMessage.includes('conexao') ||
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('503')
    ) {
        return 'Falha temporaria ao consultar o InterProScan. Tente novamente.';
    }

    return message || 'Erro ao processar a solicitacao. Tente novamente.';
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
        showNotification(normalizeApiErrorMessage(error), 'error');
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
    
    const sortedProteins = [...proteins].sort((a, b) => {
        const locusA = (a?.locus_tag || '').trim();
        const locusB = (b?.locus_tag || '').trim();

        if (!locusA && !locusB) return 0;
        if (!locusA) return 1;
        if (!locusB) return -1;

        return locusA.localeCompare(locusB, 'pt-BR', { sensitivity: 'base' });
    });

    currentProteins = sortedProteins;
    
    if (sortedProteins.length === 0) {
        countText.textContent = '❌ Nenhuma proteína hipotética foi encontrada.';
        tableContainer.style.display = 'none';
        noMessage.style.display = 'block';
        btnAnalyze.style.display = 'none';
    } else {
        countText.textContent = `✅ Encontradas ${sortedProteins.length} proteínas hipotéticas`;
        tableContainer.style.display = 'block';
        noMessage.style.display = 'none';
        btnAnalyze.style.display = 'block';
        
        // Preencher tabela com checkboxes (desmarcados por padrão)
        tableBody.innerHTML = '';
        sortedProteins.forEach((protein) => {
            const sourceIndex = Number.isInteger(protein.source_index)
                ? protein.source_index
                : Math.max((parseInt(protein.index, 10) || 1) - 1, 0);
            const regionText = protein.bgc_region_display_label || protein.bgc_region_label || (protein.bgc_region ? `Region ${protein.bgc_region}` : 'N/A');
            const typeText = Array.isArray(protein.cluster_types) && protein.cluster_types.length > 0
                ? protein.cluster_types.join(', ')
                : (protein.bgc_type || '-');
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="text-align: center;"><input type="checkbox" class="protein-checkbox" data-index="${sourceIndex}"></td>
                <td>${protein.locus_tag || '-'}</td>
                <td>${regionText}</td>
                <td>${typeText}</td>
                <td>${protein.product || '-'}</td>
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
    resetProgress();
    
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

        // Etapas 1 e 2 já concluídas (seleção feita antes)
        updateProgress(20, 1, 'Proteínas selecionadas', true);
        updateProgress(20, 2, 'Proteínas hipotéticas identificadas', true);
        updateProgress(30, 3, 'Iniciando consulta ao InterProScan...', false);

        showTimerPanel(selectedIndices.length);

        const response = await fetch(`${API_BASE_URL}/api/analyze-antismash-selected-stream`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let completedSeconds = 0;
        let result = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                let event;
                try { event = JSON.parse(line.slice(6)); } catch { continue; }

                if (event.type === 'protein_start') {
                    setTimerCurrentProtein(event.protein_id, event.index, event.total);
                    const pct = 30 + Math.round((event.index / event.total) * 55);
                    updateProgress(pct, 3, `Analisando ${event.protein_id} (${event.index + 1}/${event.total})...`, false);
                } else if (event.type === 'protein_done') {
                    completedSeconds += event.elapsed_ms / 1000;
                    updateTimerEstimates(completedSeconds, event.total - event.index - 1);
                } else if (event.type === 'complete') {
                    result = event.result;
                } else if (event.type === 'error') {
                    throw new Error(event.message);
                }
            }
        }

        hideTimerPanel();
        updateProgress(88, 3, 'Consulta ao InterProScan concluída!', true);
        updateProgress(95, 4, 'Montando resultados...', false);
        await sleep(500);
        updateProgress(100, 4, 'Análise concluída com sucesso!', true);
        await sleep(1000);
        displayResults(result);
        goToPage('page-results');

    } catch (error) {
        hideTimerPanel();
        console.error('API Error:', error);
        updateProgress(0, 3, `Erro: ${error.message}`, false);
        document.getElementById('step-3-status').textContent = '❌';
        document.getElementById('step-3-status').classList.add('error');
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
    
    resetProgress();
    
    // Etapa 1: Validação local
    updateProgress(10, 1, 'Validando sequência...');
    await sleep(500);
    updateProgress(20, 1, 'Sequência validada com sucesso!', true);
    
    // Pular etapa 2 (identificar proteínas hipotéticas)
    updateProgress(20, 2, 'Não aplicável para sequência única', true);
    
    // Etapa 3: Consultar API
    updateProgress(40, 3, 'Enviando sequência para análise...', false);
    showTimerPanel(1);
    setTimerCurrentProtein(seqId, 0, 1);

    try {
        const result = await callAPI('/api/predict-domains', 'POST', {
            seq_id: seqId,
            sequence: sequence,
            email: email
        });

        hideTimerPanel();
        updateProgress(70, 3, 'Resultado recebido do servidor', true);

        // Etapa 4: Processar resultados
        updateProgress(85, 4, 'Processando dados...', false);
        await sleep(500);
        updateProgress(100, 4, 'Análise concluída!', true);

        await sleep(1000);
        displayResults(result);
        goToPage('page-results');
    } catch (error) {
        hideTimerPanel();
        console.error('API Error:', error);
        const friendlyMessage = normalizeApiErrorMessage(error);
        updateProgress(0, 3, `Erro na consulta: ${friendlyMessage}`, false);
        document.getElementById('step-3-status').textContent = '❌';
        document.getElementById('step-3-status').classList.add('error');
        await sleep(2000);
        goToPage('page-input');
        showNotification(friendlyMessage, 'error');
    }
}

// ===== SIMULATE ANTISMASH ANALYSIS =====
async function analyzeAntismash(file, email) {
    console.log('Analisando antiSMASH:', { file: file.name, email });
    
    resetProgress();
    
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

// ===== TIMER DE ANÁLISE =====
let _timerInterval = null;
let _timerStartTime = null;

function _formatTimerTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function showTimerPanel(total) {
    _timerStartTime = Date.now();
    document.getElementById('timer-elapsed').textContent = '00:00';
    document.getElementById('timer-min').textContent = _formatTimerTime(total * 60);
    document.getElementById('timer-max').textContent = _formatTimerTime(total * 180);
    document.getElementById('timer-protein-current').textContent = '—';
    document.getElementById('timer-protein-count').textContent = `0 / ${total}`;
    document.getElementById('analysis-timer-panel').style.display = 'block';

    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = setInterval(() => {
        const elapsed = (Date.now() - _timerStartTime) / 1000;
        document.getElementById('timer-elapsed').textContent = _formatTimerTime(elapsed);
    }, 1000);
}

function hideTimerPanel() {
    if (_timerInterval) {
        clearInterval(_timerInterval);
        _timerInterval = null;
    }
    document.getElementById('analysis-timer-panel').style.display = 'none';
}

function setTimerCurrentProtein(proteinId, index, total) {
    document.getElementById('timer-protein-current').textContent = proteinId;
    document.getElementById('timer-protein-count').textContent = `${index + 1} / ${total}`;
}

function updateTimerEstimates(completedSeconds, remaining) {
    document.getElementById('timer-min').textContent = _formatTimerTime(completedSeconds + remaining * 60);
    document.getElementById('timer-max').textContent = _formatTimerTime(completedSeconds + remaining * 180);
}

// ===== RESET PROGRESS =====
function resetProgress() {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = '0%';

    for (let i = 1; i <= 4; i++) {
        const desc = document.getElementById(`step-${i}-desc`);
        const status = document.getElementById(`step-${i}-status`);
        if (desc) desc.textContent = '';
        if (status) {
            status.textContent = '⏳';
            status.classList.remove('done', 'error');
        }
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
    if (['PFAM', 'SMART', 'PROSITE', 'PANTHER', 'PRINTS', 'PIRSF', 'PIRSR', 'HAMAP', 'TIGERFAMS', 'SFLD', 'CDD', 'NCBIFAM', 'FUNFAM'].includes(db)) {
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
            emoji: '🔴', 
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
            emoji: '🟢', 
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
            emoji: '🟡', 
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
    const functionalDomains = ['PFAM', 'SMART', 'PROSITE', 'PANTHER', 'PRINTS', 'PIRSF', 'PIRSR', 'HAMAP', 'TIGERFAMS', 'SFLD', 'CDD', 'NCBIFAM', 'FUNFAM'];
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
    currentAnalysisData = data;
    const resultsContainer = document.getElementById('results-content');
    let html = '';
    currentDisplayedProteins = Array.isArray(data?.proteins) ? data.proteins : [];
    
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
    
    data.proteins.forEach((protein, proteinIndex) => {
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
                <div class="protein-info-value">${protein.bgc_region_display_label || (protein.bgc_region ? `Region ${protein.bgc_region}` : 'N/A')}</div>
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
        
        // Confidence Badge (legado)
        const getConfidenceCssClass = (level) => {
            const normalized = (level || '').toLowerCase();
            if (normalized.includes('alta')) return 'confidence-high';
            if (normalized.includes('média') || normalized.includes('media')) return 'confidence-medium';
            if (normalized.includes('baixa')) return 'confidence-low';
            return 'confidence-none';
        };

        const confidenceClass = getConfidenceCssClass(protein.confidence_level);
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

        if (protein.confidence_score !== null && protein.confidence_score !== undefined) {
            html += `
                <div class="protein-info-row">
                    <div class="protein-info-label">Score original:</div>
                    <div class="protein-info-value">${protein.confidence_score} banco(s)</div>
                </div>
            `;
        }

        // Confidence V2 (nova)
        if (protein.confidence_level_v2) {
            const confidenceClassV2 = getConfidenceCssClass(protein.confidence_level_v2);
            html += `
                <div class="protein-info-row">
                    <div class="protein-info-label">Confiança V2:</div>
                    <div class="protein-info-value">
                        <span class="confidence-badge ${confidenceClassV2}">
                            ${protein.confidence_level_v2}
                        </span>
                    </div>
                </div>
            `;
        }

        if (protein.confidence_score_v2 !== null && protein.confidence_score_v2 !== undefined) {
            html += `
                <div class="protein-info-row">
                    <div class="protein-info-label protein-info-label-inline">
                        <span>Score V2:</span>
                        <button
                            type="button"
                            class="confidence-info-button"
                            title="Explicar Score V2"
                            aria-label="Explicar Score V2"
                            onclick="showConfidenceV2Modal(${proteinIndex})"
                        >!</button>
                    </div>
                    <div class="protein-info-value">${protein.confidence_score_v2}/100</div>
                </div>
            `;
        }
        
        html += `
                </div>
        `;
        
        // Domains
        if (protein.domains && protein.domains.length > 0) {
            // Separar domínios reais (apenas funcionais e estruturais, não topologia nem não-categorizados)
            const functionalDomains = ['PFAM', 'SMART', 'PROSITE', 'PANTHER', 'PRINTS', 'PIRSF', 'PIRSR', 'HAMAP', 'TIGERFAMS', 'SFLD', 'CDD', 'NCBIFAM', 'FUNFAM'];
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
                html += `<div style="color: #555;">Foram encontrados ${totalRealDomains} domínio${totalRealDomains !== 1 ? 's' : ''} em ${totalRealDatabases} banco${totalRealDatabases !== 1 ? 's' : ''} de dados</div>`;
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
                    // Criar um ID único para o domínio
                    const domainId = `domain-${Math.random().toString(36).substr(2, 9)}`;
                    
                    html += `
                        <div class="domain-card-clickable" data-domain-id="${domainId}" style="padding: 8px; background-color: rgba(255,255,255,0.6); border-radius: 4px; border-left: 2px solid ${primaryCategory.color}; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.backgroundColor='rgba(255,255,255,1)'; this.style.transform='translateX(2px)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)';" onmouseout="this.style.backgroundColor='rgba(255,255,255,0.6)'; this.style.transform='translateX(0)'; this.style.boxShadow='none';">
                            <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px; margin-bottom: 4px;">
                                <strong style="color: ${primaryCategory.color}; word-break: break-word; flex: 1;">${domain.name}</strong>
                                <span style="font-size: 0.75em; color: #666; white-space: nowrap;">${domain.accession}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 0.85em; color: #555;">
                                <span><strong>E-value:</strong> ${domain.evalue}</span>
                                <span><strong>Posição:</strong> ${domain.start}-${domain.end}</span>
                            </div>
                            <div style="text-align: right; margin-top: 4px; font-size: 0.75em; color: #999;">
                                👆 Clique para ver detalhes completos
                            </div>
                        </div>
                    `;
                    
                    // Armazenar os dados do domínio para recuperação posterior
                    // Usar setTimeout para garantir que o elemento existe no DOM
                    setTimeout(() => {
                        const domainElement = document.querySelector(`[data-domain-id="${domainId}"]`);
                        if (domainElement) {
                            domainElement.addEventListener('click', function() {
                                showDomainDetailsModal(domain);
                            });
                            // Embedar dados do domínio para export HTML
                            domainElement.dataset.domainJson = JSON.stringify(domain);
                        }
                    }, 100);
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

        // Sequência completa da proteína
        if (protein.sequence) {
            const seq = protein.sequence;
            const lineLen = 60;
            let seqLines = '';
            for (let i = 0; i < seq.length; i += lineLen) {
                const pos = String(i + 1).padStart(6, ' ');
                seqLines += pos + '  ' + seq.slice(i, i + lineLen) + '\n';
            }
            html += `
                <details class="sequence-section">
                    <summary class="sequence-summary">
                        🧬 Sequência Completa
                        <span class="sequence-length-badge">${seq.length} aa</span>
                    </summary>
                    <pre class="sequence-pre">${seqLines.trimEnd()}</pre>
                </details>
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
        throw new Error(normalizeApiErrorMessage(error));
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
    
    // Event listener para fechar modal de detalhes ao clicar fora
    const modalDomainDetails = document.getElementById('modal-domain-details');
    if (modalDomainDetails) {
        modalDomainDetails.addEventListener('click', function(e) {
            if (e.target === modalDomainDetails) {
                closeDomainDetailsModal();
            }
        });
    }

    const modalConfidenceV2 = document.getElementById('modal-confidence-v2');
    if (modalConfidenceV2) {
        modalConfidenceV2.addEventListener('click', function(e) {
            if (e.target === modalConfidenceV2) {
                closeConfidenceV2Modal();
            }
        });
    }
    
    // Fechar modal com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('modal-domain-details');
            if (modal && modal.classList.contains('active')) {
                closeDomainDetailsModal();
            }

            const confidenceModal = document.getElementById('modal-confidence-v2');
            if (confidenceModal && confidenceModal.classList.contains('active')) {
                closeConfidenceV2Modal();
            }
        }
    });
    
    // Página inicial começa com a home (verificar no HTML que page-home tem class active)
});

// ===== MODAL DE DETALHES DO DOMÍNIO - REDESIGN =====
function showDomainDetailsModal(domain) {
    const modal = document.getElementById('modal-domain-details');
    const body = document.getElementById('domain-details-body');
    
    // Determinar a categoria do domínio
    const category = getDatabaseCategory(domain.databases[0]);
    
    // HEADER
    let html = `
        <div class="domain-header">
            <div class="domain-header-content">
                <div class="domain-icon">${category.emoji}</div>
                <div class="domain-title">
                    <h1>${domain.name}</h1>
                    <div class="accession">${domain.accession}</div>
                </div>
                <div class="domain-category-badge">
                    ${category.category}
                </div>
            </div>
        </div>
        
        <div class="domain-info-grid">
    `;
    
    // Card 1: Bancos de Dados
    html += `
        <div class="info-card">
            <div class="info-card-header">
                <span class="info-card-icon">🗄️</span>
                Bancos de Dados
            </div>
            <div class="info-card-content">
                ${domain.databases.map(db => `
                    <span class="badge badge-database">${db}</span>
                `).join('')}
            </div>
        </div>
    `;
    
    // Card 2: Posição
    html += `
        <div class="info-card">
            <div class="info-card-header">
                <span class="info-card-icon">📍</span>
                Posição na Sequência
            </div>
            <div class="info-card-content">
                <div style="margin-bottom: 8px;">
                    <span class="badge badge-position">${domain.start} → ${domain.end}</span>
                </div>
                <div style="color: #666;">
                    <strong>${domain.end - domain.start + 1}</strong> aminoácidos
                </div>
            </div>
        </div>
    `;
    
    // Card 4: E-value
    html += `
        <div class="info-card">
            <div class="info-card-header">
                <span class="info-card-icon">📊</span>
                E-value
            </div>
            <div class="info-card-content">
                <span class="badge badge-stat" style="font-size: 1.1em; padding: 8px 14px;">
                    ${domain.evalue}
                </span>
            </div>
        </div>
    `;
    
    // Card 5: Score (se disponível)
    if (domain.score && domain.score !== 'N/A' && domain.score !== null) {
        html += `
            <div class="info-card">
                <div class="info-card-header">
                    <span class="info-card-icon">&#128202;</span>
                    Score
                </div>
                <div class="info-card-content">
                    <span class="badge badge-stat" style="font-size: 1.1em; padding: 8px 14px;">
                        ${domain.score}
                    </span>
                </div>
            </div>
        `;
    }
    
    // Card 6: Tipo (se disponível)
    if (domain.type && domain.type !== 'N/A' && domain.type !== '') {
        html += `
            <div class="info-card">
                <div class="info-card-header">
                    <span class="info-card-icon">🏷️</span>
                    Tipo
                </div>
                <div class="info-card-content">
                    <span class="badge" style="background: #f0f0f0; color: #333; font-family: monospace; font-size: 1em; padding: 8px 14px;">
                        ${domain.type}
                    </span>
                </div>
            </div>
        `;
    }
    
    // Card 7: Descrição (se disponível) - Card grande
    if (domain.description && domain.description !== 'N/A' && domain.description !== '') {
        html += `
            <div class="info-card info-card-large">
                <div class="info-card-header">
                    <span class="info-card-icon">📝</span>
                    Descrição
                </div>
                <div class="info-card-content" style="font-size: 1em; line-height: 1.7;">
                    ${domain.description}
                </div>
            </div>
        `;
    }
    
    // Card 8: InterPro (se disponível) - Card destacado
    if (domain.interpro_accession && domain.interpro_accession !== 'N/A' && domain.interpro_accession !== '') {
        const spanClass = domain.type || domain.description ? 'info-card-large' : 'info-card-full';
        html += `
            <div class="info-card info-card-highlight ${spanClass}">
                <div class="info-card-header">
                    <span class="info-card-icon">🔗</span>
                    InterPro Entry
                </div>
                <div class="info-card-content">
                    <div style="margin-bottom: 10px;">
                        <a href="https://www.ebi.ac.uk/interpro/entry/InterPro/${domain.interpro_accession}/" target="_blank" class="interpro-link">
                            ${domain.interpro_accession}
                            <span>🔗</span>
                        </a>
                    </div>
        `;
        
        if (domain.interpro_name && domain.interpro_name !== 'N/A' && domain.interpro_name !== '') {
            html += `
                    <div style="margin-top: 8px; color: #333; font-weight: 500;">
                        ${domain.interpro_name}
                    </div>
            `;
        }
        
        html += `
                </div>
            </div>
        `;
    }
    
    html += `</div>`; // Fechar grid
    
    body.innerHTML = html;
    modal.classList.add('active');
}

function closeDomainDetailsModal() {
    const modal = document.getElementById('modal-domain-details');
    modal.classList.remove('active');
}

function showConfidenceV2Modal(proteinIndex) {
    const protein = currentDisplayedProteins[proteinIndex];
    const breakdown = protein?.confidence_breakdown_v2;

    if (!protein || !breakdown) {
        showNotification('Nao foi possivel carregar os detalhes do Score V2.', 'error');
        return;
    }

    const totalHits = breakdown.total_hits || 0;
    const uniqueDatabases = breakdown.unique_databases || 0;
    const goodHits = breakdown.good_hits || 0;
    const strongHits = breakdown.strong_hits || 0;
    const interproHits = breakdown.interpro_hits || 0;
    const clusterCount = breakdown.cluster_count ?? breakdown.bucket_count ?? 0;
    const clusteredHits = breakdown.clustered_hits ?? breakdown.multi_support_buckets ?? 0;
    const consensusPercent = breakdown.consensus_percent || 0;
    const dbScore = breakdown.db_score || 0;
    const qualityScore = breakdown.quality_score || 0;
    const interproScore = breakdown.interpro_score || 0;
    const consensusScore = breakdown.consensus_score || 0;
    const finalScore = protein.confidence_score_v2 || 0;
    const level = protein.confidence_level_v2 || 'Nenhum';

    const body = document.getElementById('confidence-v2-body');
    const modal = document.getElementById('modal-confidence-v2');

    body.innerHTML = `
        <div class="confidence-modal-header">
            <h2>Score V2 de ${protein.seq_id}</h2>
            <p>Nota final: <strong>${finalScore}/100</strong> (${level}). O calculo usa um heuristico interno sobre os resultados do InterProScan, combinando diversidade de bancos, qualidade estatistica, suporte InterPro e consenso posicional.</p>
        </div>

        <div class="confidence-modal-grid">
            <div class="confidence-modal-card">
                <h3>Valores usados</h3>
                <p>dbs=${uniqueDatabases}, hits=${totalHits}, e&lt;=1e-5=${goodHits}, e&lt;=1e-20=${strongHits}, IPR=${interproHits}, agrupamentos=${clusterCount}, hits agrupados=${clusteredHits}, consenso=${consensusPercent}%.</p>
            </div>
            <div class="confidence-modal-card">
                <h3>Base do calculo</h3>
                <p>O score nao vem do InterPro como nota oficial. Ele e derivado de um heuristico local para reduzir falso positivo por redundancia entre bancos e destacar sinais mais robustos. No consenso posicional, dois hits entram no mesmo agrupamento apenas quando start e end diferem no maximo em 9 aminoacidos.</p>
            </div>
            <div class="confidence-modal-card">
                <h3>Leitura rapida</h3>
                <p>Cada criterio vale ate 25 pontos: diversidade de bancos, qualidade estatistica, suporte InterPro e consenso posicional.</p>
            </div>
        </div>

        <div class="confidence-formula-list">
            <div class="confidence-formula-item">
                <strong>1. Diversidade de bancos</strong>
                <code>min(dbs / 5, 1) x 25 = min(${uniqueDatabases} / 5, 1) x 25 = ${dbScore}</code>
            </div>
            <div class="confidence-formula-item">
                <strong>2. Qualidade por e-value</strong>
                <code>min((strong_hits + 0.5 x (good_hits - strong_hits)) / hits, 1) x 25 = min((${strongHits} + 0.5 x (${goodHits} - ${strongHits})) / ${Math.max(totalHits, 1)}, 1) x 25 = ${qualityScore}</code>
            </div>
            <div class="confidence-formula-item">
                <strong>3. Suporte InterPro</strong>
                <code>(IPR / hits) x 25 = (${interproHits} / ${Math.max(totalHits, 1)}) x 25 = ${interproScore}</code>
            </div>
            <div class="confidence-formula-item">
                <strong>4. Consenso posicional</strong>
                <code>agrupar hits quando |start1-start2| <= 9 e |end1-end2| <= 9; depois calcular (hits em agrupamentos / hits totais) x 25 = (${clusteredHits} / ${Math.max(totalHits, 1)}) x 25 = ${consensusScore}</code>
            </div>
            <div class="confidence-formula-item">
                <strong>5. Nota final</strong>
                <code>${dbScore} + ${qualityScore} + ${interproScore} + ${consensusScore} = ${finalScore}</code>
            </div>
        </div>

        <div class="confidence-modal-note">
            Este score foi baseado em quatro perguntas: quantos bancos independentes concordam, quao fortes sao os e-values, quantos hits tem integracao InterPro e quanto as posicoes dos hits convergem entre bancos. Quanto maior a diversidade, a qualidade estatistica e o suporte InterPro, melhor. Quanto menor a concordancia posicional, menor a parcela de consenso.
        </div>
    `;

    modal.classList.add('active');
}

function closeConfidenceV2Modal() {
    const modal = document.getElementById('modal-confidence-v2');
    modal.classList.remove('active');
}

// ===== DOWNLOAD RESULTS =====
function buildCSV(proteins) {
    const headers = [
        'protein_id', 'bgc_region', 'cluster_types',
        'confidence_level', 'confidence_score_v2',
        'domain_name', 'domain_accession', 'databases',
        'start', 'end', 'evalue', 'score', 'type', 'description',
        'interpro_accession', 'interpro_name'
    ];

    const escape = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    };

    const rows = [headers.join(',')];

    proteins.forEach(protein => {
        const regionLabel = protein.bgc_region_display_label
            || (protein.bgc_region ? `Region ${protein.bgc_region}` : '');

        const base = [
            escape(protein.seq_id),
            escape(regionLabel),
            escape(Array.isArray(protein.cluster_types) ? protein.cluster_types.join('; ') : ''),
            escape(protein.confidence_level || ''),
            escape(protein.confidence_score_v2 ?? ''),
        ];

        if (protein.domains && protein.domains.length > 0) {
            protein.domains.forEach(domain => {
                rows.push([
                    ...base,
                    escape(domain.name),
                    escape(domain.accession),
                    escape(Array.isArray(domain.databases) ? domain.databases.join('; ') : ''),
                    escape(domain.start),
                    escape(domain.end),
                    escape(domain.evalue),
                    escape(domain.score),
                    escape(domain.type),
                    escape(domain.description),
                    escape(domain.interpro_accession),
                    escape(domain.interpro_name)
                ].join(','));
            });
        } else {
            rows.push([...base, '', '', '', '', '', '', '', '', '', '', ''].join(','));
        }
    });

    return rows.join('\n');
}

async function downloadResults() {
    if (!currentAnalysisData) {
        showNotification('Nenhum resultado disponível para download.', 'error');
        return;
    }

    if (typeof JSZip === 'undefined') {
        showNotification('Biblioteca de ZIP não carregada. Verifique a conexão.', 'error');
        return;
    }

    try {
        const zip = new JSZip();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

        // JSON
        zip.file('resultados.json', JSON.stringify(currentAnalysisData, null, 2));

        // CSV
        const csv = buildCSV(currentAnalysisData.proteins || []);
        zip.file('dominios.csv', csv);

        // HTML
        const htmlContent = await buildExportHTML();
        zip.file('resultados.html', htmlContent);

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `anotacao_${timestamp}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Erro ao gerar ZIP:', err);
        showNotification('Erro ao gerar o arquivo ZIP.', 'error');
    }
}

async function buildExportHTML() {
    // 1. CSS da página
    let css = '';
    try {
        const resp = await fetch('style.css');
        if (resp.ok) css = await resp.text();
    } catch (_) {}

    // 2. Conteúdo já renderizado (domain cards têm data-domain-json embutido via setTimeout)
    const resultsContent = document.getElementById('results-content')?.innerHTML || '';

    // 3. Capturar HTML dos modais com estado limpo
    const domainModalEl = document.getElementById('modal-domain-details');
    const confModalEl = document.getElementById('modal-confidence-v2');
    if (domainModalEl) {
        domainModalEl.classList.remove('active');
        document.getElementById('domain-details-body').innerHTML = '';
    }
    if (confModalEl) {
        confModalEl.classList.remove('active');
        document.getElementById('confidence-v2-body').innerHTML = '';
    }
    const modalDomainHTML = domainModalEl ? domainModalEl.outerHTML : '';
    const modalConfHTML = confModalEl ? confModalEl.outerHTML : '';

    // 4. Serializar dados de proteínas para o modal de confiança
    const jsData = 'window.__EXPORT_DATA = ' + JSON.stringify(currentAnalysisData) + ';';

    // 5. Funções puras — serializadas diretamente (sem dependências externas problemáticas)
    const jsGetDbCategory = getDatabaseCategory.toString();
    const jsDomainModal = showDomainDetailsModal.toString();
    const jsCloseDomain = closeDomainDetailsModal.toString();
    const jsCloseConf = closeConfidenceV2Modal.toString();

    // 6. showConfidenceV2Modal adaptada: substitui currentDisplayedProteins e showNotification
    const jsConfModal = showConfidenceV2Modal.toString()
        .replace('currentDisplayedProteins[proteinIndex]', 'window.__EXPORT_DATA.proteins[proteinIndex]')
        .replace(/showNotification\s*\([^)]*\)\s*;?/g, 'console.warn("Dados não encontrados para índice " + proteinIndex); return;');

    // 7. Script de inicialização — reconecta listeners usando data-domain-json
    const jsInit = `
document.addEventListener('DOMContentLoaded', function() {
    // Reconectar clique nos cards de domínio usando dados embutidos
    document.querySelectorAll('.domain-card-clickable').forEach(function(card) {
        var raw = card.dataset.domainJson;
        if (raw) {
            try {
                var domain = JSON.parse(raw);
                card.addEventListener('click', function() { showDomainDetailsModal(domain); });
            } catch(e) {}
        }
    });

    // Fechar modais clicando no backdrop
    var md = document.getElementById('modal-domain-details');
    var mc = document.getElementById('modal-confidence-v2');
    if (md) md.addEventListener('click', function(e) { if (e.target === md) closeDomainDetailsModal(); });
    if (mc) mc.addEventListener('click', function(e) { if (e.target === mc) closeConfidenceV2Modal(); });

    // Fechar com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { closeDomainDetailsModal(); closeConfidenceV2Modal(); }
    });
});
`;

    const allJS = [jsData, jsGetDbCategory, jsDomainModal, jsCloseDomain, jsConfModal, jsCloseConf, jsInit].join('\n\n');

    const exportStyle = `
        body { margin: 0; padding: 0; background: #f5f7fa; }
        .export-page { max-width: 900px; margin: 0 auto; padding: 32px 20px; }
        .export-header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e0e6f0; }
        .export-header h1 { font-size: 1.5em; color: #0052cc; margin: 0 0 4px; }
        .export-header p { color: #888; font-size: 0.9em; margin: 0; }
    `;

    const exportedAt = new Date().toLocaleString('pt-BR');

    // 8. Montar HTML via array join (evita conflito de backticks com template literals)
    return [
        '<!DOCTYPE html>',
        '<html lang="pt-BR">',
        '<head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '<title>Resultados da Análise Proteica</title>',
        '<style>', css, '</style>',
        '<style>', exportStyle, '</style>',
        '</head>',
        '<body>',
        modalDomainHTML,
        modalConfHTML,
        '<div class="export-page">',
        '<div class="export-header">',
        '<h1>Anotador Funcional Proteico \u2014 Resultados</h1>',
        '<p>Exportado em ' + exportedAt + '</p>',
        '</div>',
        resultsContent,
        '</div>',
        '<script>', allJS, '</scr' + 'ipt>',
        '</body>',
        '</html>'
    ].join('\n');
}
