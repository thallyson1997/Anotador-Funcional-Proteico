// ===== NOTIFICAÇÃO =====
function showNotification(message, type = 'error', duration = 5000) {
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notification-message');
    notificationMessage.textContent = message;
    notification.className = `notification active ${type}`;
    if (duration > 0) {
        setTimeout(closeNotification, duration);
    }
}

function closeNotification() {
    document.getElementById('notification').classList.remove('active');
}

// ===== NAVEGAÇÃO =====
function goToPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');
        window.scrollTo(0, 0);
    }
}

// ===== ATUALIZAR LABELS DOS INPUTS DE ARQUIVO =====
document.addEventListener('DOMContentLoaded', function () {
    ['a', 'b'].forEach(id => {
        const input = document.getElementById(`file-${id}`);
        if (!input) return;
        input.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                document.getElementById(`file-${id}-text`).textContent =
                    `✅ ${file.name} (${sizeMB} MB)`;
                document.getElementById(`card-${id}`).classList.add('card-has-file');
            }
        });
    });
});

// ===== SUBMIT =====
async function submitComparison() {
    const fileA = document.getElementById('file-a').files[0];
    const fileB = document.getElementById('file-b').files[0];

    if (!fileA || !fileB) {
        showNotification('Selecione os dois arquivos antes de comparar.', 'error');
        return;
    }

    const btn = document.getElementById('btn-compare');
    btn.disabled = true;
    btn.textContent = '⏳ Processando...';

    try {
        const formData = new FormData();
        formData.append('file_a', fileA);
        formData.append('file_b', fileB);

        const response = await fetch('/api/compare-bgc', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Erro ${response.status}`);
        }

        const data = await response.json();
        renderResults(data);
        goToPage('page-results');

    } catch (error) {
        showNotification(error.message || 'Erro ao comparar arquivos.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔀 Comparar BGCs';
    }
}

// ===== RENDERIZAR RESULTADOS =====
function renderResults(data) {
    const nameA = document.getElementById('name-a').value.trim()
        || data.file_a.organism
        || data.file_a.filename;
    const nameB = document.getElementById('name-b').value.trim()
        || data.file_b.organism
        || data.file_b.filename;

    const pct = data.similarity_percent;
    const gaugeColor = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626';

    // Arco SVG: circunferência de raio 50 em semicírculo = PI*50 ≈ 157
    const arcLen = (pct / 100) * 157;

    function tagList(types, sharedSet, classOwn) {
        if (!types.length) return '<span style="color:var(--text-muted); font-size:0.85em">Nenhum cluster detectado</span>';
        return types.map(t => {
            const cls = sharedSet.has(t) ? 'bgc-shared' : classOwn;
            return `<span class="bgc-tag ${cls}">${escapeHtml(t)}</span>`;
        }).join('');
    }

    const sharedSet = new Set(data.shared_types);

    const html = `
        <div class="compare-result-header">
            <div class="similarity-gauge">
                <svg viewBox="0 0 120 70" class="gauge-svg" aria-label="Similaridade ${pct}%">
                    <!-- trilha -->
                    <path d="M10,70 A50,50,0,0,1,110,70"
                          fill="none" stroke="var(--bg-raised)" stroke-width="12" stroke-linecap="round"/>
                    <!-- preenchimento -->
                    <path d="M10,70 A50,50,0,0,1,110,70"
                          fill="none" stroke="${gaugeColor}" stroke-width="12" stroke-linecap="round"
                          stroke-dasharray="${arcLen} 157"/>
                </svg>
                <div class="gauge-value" style="color:${gaugeColor}">${pct.toFixed(1)}%</div>
                <div class="gauge-label">Similaridade de Jaccard</div>
            </div>
        </div>

        <div class="compare-organisms">
            <div class="organism-card">
                <div class="organism-name">
                    <span class="compare-label label-a">A</span>
                    ${escapeHtml(nameA)}
                </div>
                <div class="organism-stats">
                    <span>🧬 ${data.file_a.bgc_count} BGCs detectados</span>
                    <span>🏷️ ${data.file_a.bgc_types.length} tipos únicos</span>
                </div>
                <div class="bgc-type-list">
                    ${tagList(data.file_a.bgc_types, sharedSet, 'bgc-unique-a')}
                </div>
            </div>

            <div class="organism-card">
                <div class="organism-name">
                    <span class="compare-label label-b">B</span>
                    ${escapeHtml(nameB)}
                </div>
                <div class="organism-stats">
                    <span>🧬 ${data.file_b.bgc_count} BGCs detectados</span>
                    <span>🏷️ ${data.file_b.bgc_types.length} tipos únicos</span>
                </div>
                <div class="bgc-type-list">
                    ${tagList(data.file_b.bgc_types, sharedSet, 'bgc-unique-b')}
                </div>
            </div>
        </div>

        <div class="compare-breakdown">
            <div class="breakdown-card">
                <h3>🟢 BGCs em Comum</h3>
                <p class="breakdown-count">${data.shared_types.length}</p>
                <div class="bgc-type-list">
                    ${data.shared_types.length
                        ? data.shared_types.map(t => `<span class="bgc-tag bgc-shared">${escapeHtml(t)}</span>`).join('')
                        : '<span style="color:var(--text-muted); font-size:0.85em">Nenhum tipo em comum</span>'}
                </div>
            </div>
            <div class="breakdown-card">
                <h3>🔵 Exclusivos de A</h3>
                <p class="breakdown-count">${data.only_in_a.length}</p>
                <div class="bgc-type-list">
                    ${data.only_in_a.length
                        ? data.only_in_a.map(t => `<span class="bgc-tag bgc-unique-a">${escapeHtml(t)}</span>`).join('')
                        : '<span style="color:var(--text-muted); font-size:0.85em">Nenhum exclusivo</span>'}
                </div>
            </div>
            <div class="breakdown-card">
                <h3>🟠 Exclusivos de B</h3>
                <p class="breakdown-count">${data.only_in_b.length}</p>
                <div class="bgc-type-list">
                    ${data.only_in_b.length
                        ? data.only_in_b.map(t => `<span class="bgc-tag bgc-unique-b">${escapeHtml(t)}</span>`).join('')
                        : '<span style="color:var(--text-muted); font-size:0.85em">Nenhum exclusivo</span>'}
                </div>
            </div>
        </div>
    `;

    document.getElementById('results-content').innerHTML = html;
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
