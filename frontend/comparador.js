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

        ${renderTypeCountTable(data, nameA, nameB)}

        ${renderMIBiGSection(data, nameA, nameB)}

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

function renderMIBiGSection(data, nameA, nameB) {
    const rows = data.mibig_rows || [];
    if (!rows.length) return '';

    const tableRows = rows.map(row => {
        let rowClass = '';
        if (row.in_a && row.in_b) rowClass = 'row-shared';
        else if (row.in_a)        rowClass = 'row-only-a';
        else                      rowClass = 'row-only-b';

        function simCell(present, sim, regions) {
            if (!present) return '<td class="mibig-cell mibig-absent"><span class="presence-no">✗</span></td>';
            const simHtml = sim != null
                ? `<span class="mibig-sim">${sim.toFixed(0)}%</span>`
                : '<span class="mibig-sim mibig-sim-na">N/D</span>';
            const regionHtml = regions && regions.length
                ? `<span class="mibig-region">${regions.map(r => escapeHtml(r)).join(', ')}</span>`
                : '';
            return `<td class="mibig-cell">${simHtml}${regionHtml}</td>`;
        }

        const mibigUrl = `https://mibig.secondarymetabolites.org/go/${escapeHtml(row.bgc_id)}`;
        return `
            <tr class="${rowClass}">
                <td class="mibig-id-cell">
                    <a href="${mibigUrl}" target="_blank" rel="noopener noreferrer"
                       class="mibig-link">${escapeHtml(row.bgc_id)}</a>
                </td>
                <td class="type-name-cell">${escapeHtml(row.compound)}</td>
                ${simCell(row.in_a, row.similarity_a, row.regions_a)}
                ${simCell(row.in_b, row.similarity_b, row.regions_b)}
            </tr>`;
    }).join('');

    return `
        <div class="cluster-table-section mibig-section">
            <div class="cluster-table-header">
                <h3>🧪 Similaridade com MIBiG (KnownClusterBlast)</h3>
                <a href="https://mibig.secondarymetabolites.org/" target="_blank"
                   rel="noopener noreferrer" class="mibig-ref-link">O que é MIBiG?</a>
            </div>
            <div class="cluster-table-wrapper">
                <table class="cluster-table mibig-table">
                    <thead>
                        <tr>
                            <th>BGC ID</th>
                            <th>Composto Previsto</th>
                            <th><span class="compare-label label-a">A</span> ${escapeHtml(nameA)}</th>
                            <th><span class="compare-label label-b">B</span> ${escapeHtml(nameB)}</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
            <p class="mibig-note">
                % = genes da região com hit no cluster de referência (KnownClusterBlast).
                N/D = antiSMASH não reportou percentual neste arquivo.
            </p>
        </div>`;
}

function renderTypeCountTable(data, nameA, nameB) {
    const countsA = data.file_a.type_counts || {};
    const countsB = data.file_b.type_counts || {};
    const allTypes = Array.from(
        new Set([...Object.keys(countsA), ...Object.keys(countsB)])
    ).sort();

    if (!allTypes.length) return '';

    function cell(n) {
        const countHtml = n > 0 ? n : '<span class="count-zero">—</span>';
        const presenceHtml = n > 0
            ? '<span class="presence-yes">✓</span>'
            : '<span class="presence-no">✗</span>';
        return `<td class="count-cell">
            <span class="val-count">${countHtml}</span>
            <span class="val-presence">${presenceHtml}</span>
        </td>`;
    }

    const rows = allTypes.map(type => {
        const a = countsA[type] || 0;
        const b = countsB[type] || 0;
        let rowClass = '';
        if (a > 0 && b > 0) rowClass = 'row-shared';
        else if (a > 0)     rowClass = 'row-only-a';
        else                rowClass = 'row-only-b';

        return `
            <tr class="${rowClass}">
                <td class="type-name-cell">${escapeHtml(type)}</td>
                ${cell(a)}
                ${cell(b)}
            </tr>`;
    }).join('');

    return `
        <div class="cluster-table-section">
            <div class="cluster-table-header">
                <h3>📊 Clusters por Tipo</h3>
                <div class="table-mode-toggle" role="group" aria-label="Modo de visualização">
                    <button class="mode-btn mode-btn-active" onclick="setTableMode(this, 'count')">
                        # Contagem
                    </button>
                    <button class="mode-btn" onclick="setTableMode(this, 'presence')">
                        ✓✗ Presença
                    </button>
                </div>
            </div>
            <div class="cluster-table-wrapper">
                <table class="cluster-table">
                    <thead>
                        <tr>
                            <th>Tipo de BGC</th>
                            <th><span class="compare-label label-a">A</span> ${escapeHtml(nameA)}</th>
                            <th><span class="compare-label label-b">B</span> ${escapeHtml(nameB)}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                        <tr class="total-row">
                            <td>Total de BGCs</td>
                            <td class="count-cell total-count">${data.file_a.bgc_count}</td>
                            <td class="count-cell total-count">${data.file_b.bgc_count}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>`;
}

function setTableMode(btn, mode) {
    const section = btn.closest('.cluster-table-section');
    const wrapper = section.querySelector('.cluster-table-wrapper');
    section.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('mode-btn-active'));
    btn.classList.add('mode-btn-active');
    wrapper.classList.toggle('mode-presence', mode === 'presence');
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
