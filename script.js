document.addEventListener("DOMContentLoaded", () => {
    console.log("MINT-Bench Demo Page Initialized.");

    // ==========================================
    // 1. 顶部导航平滑滚动
    // ==========================================
    document.querySelectorAll('.nav-links a').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // ==========================================
    // 2. TOC 侧边栏滚动监听 (ScrollSpy)
    // ==========================================
    const sections = document.querySelectorAll('.section, .subsection-title');
    const tocLinks = document.querySelectorAll('.toc-link');

    window.addEventListener('scroll', () => {
        let currentSectionId = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            // 150px 是判定偏移量
            if (scrollY >= (sectionTop - 150)) {
                currentSectionId = section.getAttribute('id');
            }
        });

        tocLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${currentSectionId}`) {
                link.classList.add('active');
            }
        });
    });

    // 给 TOC 的链接也增加平滑滚动
    tocLinks.forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // ==========================================
    // 3. Leaderboard 语种切换逻辑
    // ==========================================
    
    // 【修改点 1】：只获取 overall 的 tabs
    const leaderboardTabs = document.querySelectorAll('#overall-lang-tabs .lang-tab'); 
    
    // 【修改点 2】：只获取 overall 的 tables（通过 id 属性以 table- 开头来过滤，避免误伤 detailed-heatmap-table）
    const leaderboardTables = document.querySelectorAll('#leaderboard table[id^="table-"]'); 

    leaderboardTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            leaderboardTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const targetLang = tab.getAttribute('data-lang');
            leaderboardTables.forEach(table => {
                if (table.id === `table-${targetLang}`) {
                    table.classList.remove('hidden-table');
                    table.classList.add('active-table');
                } else {
                    table.classList.remove('active-table');
                    table.classList.add('hidden-table');
                }
            });
        });
    });

    // ==========================================
    // 4. Demos 动态数据驱动渲染逻辑
    // ==========================================
    
    let allDemoData = {};           // 当前语种的所有 JSON 数据
    let taxonomyTree = {};          // 解析生成的分类树
    let activePath = [];            // 当前选中的分类路径
    let currentFilteredPlans = [];  // 当前路径下的所有样本 ID
    let currentSampleIndex = 0;     // 当前显示的样本索引
    let currentDemoLang = 'en';     // 默认加载语种

    let currentDisplayModels = [];  // 当前语种实际包含的模型
    // 这里设定你期望的模型排序优先级，未在列表内的模型会自动按字母排在最后
    const preferredModelOrder = [
        "geminiflash", "geminipro", "elevenlabs", "gpt4omini", 
        "qwen3tts", "minimax", "mimo", "mingmoe", "mingdense", 
        "moss1b7", "voicesculptor", "parlerttslarge", "parlerttsmini"
    ];

    // 【新增】模型名称映射字典
    const MODEL_NAME_MAP = {
        "geminiflash": "Gemini 2.5-Flash",
        "geminipro": "Gemini 2.5-Pro",
        "elevenlabs": "ElevenLabs-ttv-v3",
        "qwen3tts": "Qwen3TTS-12Hz-1.7B-VD",
        "minimax": "MiniMax-Speech-2.7",
        "moss1b7": "MOSS-VoiceGenerator",
        "hume": "Hume-Octave1",
        "mimo": "MiMo-Audio-7B-Instruct",
        "gpt4omini": "GPT-4o-Mini-TTS",
        "mingmoe": "Ming-omni-tts-16.8B-A3B",
        "mingdense": "Ming-omni-tts-0.5B",
        "parlerttslarge": "Parler-TTS Large",
        "parlerttsmini": "Parler-TTS Mini",
        "voicesculptor": "VoiceSculptor"
    };

    // 【新增】获取美化后的模型名
    function getDisplayModelName(rawName) {
        return MODEL_NAME_MAP[rawName] || rawName;
    }

    // 格式化标签显示 (例如 "complex_comp" -> "Complex Comp")
    function formatLabel(str) {
        return str.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    // 从 JSON 数据中自动构建多层级分类树
    function buildTaxonomyTree() {
        taxonomyTree = {};
        for (const planId in allDemoData) {
            const path = allDemoData[planId].shared_info.taxonomy_node;
            if (!path) continue;
            
            const parts = path.split('/');
            let current = taxonomyTree;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (!current[part]) {
                    current[part] = {};
                }
                current = current[part];
            }
        }
    }

    // 动态渲染所有层级的级联按钮
    function renderTaxonomyLevels() {
        const container = document.getElementById('taxonomy-tabs-container');
        container.innerHTML = '';

        let currentLevelObj = taxonomyTree;
        let levelIdx = 0;

        // 只要当前层级还有子选项，就继续生成新的一排 Button
        while (currentLevelObj && Object.keys(currentLevelObj).length > 0) {
            
            // 【关键修复🔥】：将当前循环的层级固定为常量，防止闭包变量污染
            const currentLevel = levelIdx; 
            
            // 自定义排序：保证第一层 always 是 easy, hard, special
            const keys = Object.keys(currentLevelObj).sort((a, b) => {
                const order = { "easy": 1, "hard": 2, "special": 3 };
                if (order[a] && order[b]) return order[a] - order[b];
                return a.localeCompare(b);
            });
            
            const rowDiv = document.createElement('div');
            rowDiv.className = 'demo-tabs-row';
            rowDiv.dataset.level = currentLevel;

            // 检查当前路径是否有效，无效则默认选中第一个
            let activeKeyForThisLevel = activePath[currentLevel];
            if (!activeKeyForThisLevel || !keys.includes(activeKeyForThisLevel)) {
                activeKeyForThisLevel = keys[0];
                activePath[currentLevel] = activeKeyForThisLevel;
                activePath = activePath.slice(0, currentLevel + 1); // 截断旧的无效深层路径
            }

            // 渲染该层级所有的选项按钮
            keys.forEach(key => {
                const btn = document.createElement('button');
                btn.className = currentLevel === 0 ? 'level-tab-primary' : 'level-tab';
                if (key === activeKeyForThisLevel) btn.classList.add('active');
                
                btn.textContent = formatLabel(key);
                
                // 点击事件：更新路径并重新渲染树
                btn.onclick = () => {
                    // 【关键修复🔥】：这里使用固定的 currentLevel 而不是 levelIdx
                    activePath = activePath.slice(0, currentLevel);
                    activePath.push(key);
                    renderTaxonomyLevels(); 
                };
                
                rowDiv.appendChild(btn);
            });

            container.appendChild(rowDiv);
            currentLevelObj = currentLevelObj[activeKeyForThisLevel];
            levelIdx++;
        }

        // 树渲染结束，到达叶子节点，触发过滤
        const finalPathStr = activePath.join('/');
        filterDataByPath(finalPathStr);
    }

    // 根据最终的 taxonomy_node 路径过滤样本
    function filterDataByPath(pathStr) {
        currentFilteredPlans = [];
        for (const [planId, planData] of Object.entries(allDemoData)) {
            if (planData.shared_info.taxonomy_node === pathStr) {
                currentFilteredPlans.push(planId);
            }
        }
        currentSampleIndex = 0;
        renderCurrentSample();
    }

    // 按需加载对应语种的 JSON 数据
    function loadDemoData(lang) {
        const container = document.getElementById('model-cards-container');
        const taxonomyContainer = document.getElementById('taxonomy-tabs-container');
        
        container.innerHTML = "<p class='text-muted' style='grid-column: span 4; text-align: center; padding: 2rem;'>Loading audio data...</p>";
        taxonomyContainer.innerHTML = ''; 
        
        // 请确保这个路径与你实际存放 demos_xx.json 的路径一致
        fetch(`./assets/demos/inst_follow/metadatas/demos_${lang}.json`)
            .then(response => {
                if (!response.ok) throw new Error("JSON file not found.");
                return response.json();
            })
            .then(data => {
                allDemoData = data;
                
                // 自动提取并排序该语种下的可用模型
                let uniqueModels = new Set();
                for (const planId in data) {
                    if (data[planId].models) {
                        Object.keys(data[planId].models).forEach(m => uniqueModels.add(m));
                    }
                }
                
                currentDisplayModels = Array.from(uniqueModels).sort((a, b) => {
                    let idxA = preferredModelOrder.indexOf(a);
                    let idxB = preferredModelOrder.indexOf(b);
                    idxA = idxA === -1 ? 999 : idxA;
                    idxB = idxB === -1 ? 999 : idxB;
                    if (idxA !== idxB) return idxA - idxB;
                    return a.localeCompare(b);
                });

                // 构建分类树并渲染
                buildTaxonomyTree();       
                renderTaxonomyLevels();    
            })
            .catch(err => {
                console.error(`Failed to load demos_${lang}.json`, err);
                container.innerHTML = `<p class='text-muted' style='grid-column: span 4; text-align: center; padding: 2rem;'>Demo data for ${lang.toUpperCase()} is not available or coming soon.</p>`;
                document.getElementById('sample-counter').textContent = "0 / 0";
            });
    }

    // 初始化 Demos 事件
    function initDemos() {
        const demoLangTabs = document.querySelectorAll('#demo-lang-tabs .lang-tab');
        demoLangTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                demoLangTabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                
                const newLang = e.target.getAttribute('data-lang');
                if (newLang !== currentDemoLang) {
                    currentDemoLang = newLang;
                    activePath = []; // 切换语种时重置分类树导航路径
                    loadDemoData(newLang); 
                }
            });
        });

        // 绑定上下页样本切换
        document.getElementById('btn-prev-sample').addEventListener('click', () => {
            if (currentSampleIndex > 0) {
                currentSampleIndex--;
                renderCurrentSample();
            }
        });
        document.getElementById('btn-next-sample').addEventListener('click', () => {
            if (currentSampleIndex < currentFilteredPlans.length - 1) {
                currentSampleIndex++;
                renderCurrentSample();
            }
        });

        // 页面初始加载默认语种的 Demos 数据
        loadDemoData(currentDemoLang); 
    }

    // 辅助格式化函数
    function getScoreBadge(score) {
        const s = parseFloat(score);
        if (isNaN(s)) return "❓";
        if (s >= 4.5) return "🟢";
        if (s >= 3.0) return "🟡";
        return "🔴";
    }
    
    function getLevelBadge(level) {
        if (level === 3) return "🟢";
        if (level === 2) return "🟡";
        if (level === 1) return "🔴";
        return "❓";
    }

    function getBonusBadge(flag) {
        if (flag === true) return "+1 ✅";
        if (flag === false) return "0 ❌";
        return "NA";
    }

    // 渲染具体的 Shared Input 与 模型音频卡片网格
    function renderCurrentSample() {
        const container = document.getElementById('model-cards-container');
        const counter = document.getElementById('sample-counter');

        if (currentFilteredPlans.length === 0) {
            counter.textContent = "0 / 0";
            container.innerHTML = "<p class='text-muted' style='grid-column: span 4; text-align: center; padding: 2rem;'>No samples found for this category.</p>";
            
            // 清空共享输入区
            document.getElementById('lbl-plan-id').textContent = "N/A";
            document.getElementById('lbl-taxonomy').textContent = "N/A";
            document.getElementById('lbl-instruction').textContent = "N/A";
            document.getElementById('lbl-text').textContent = "N/A";
            document.getElementById('lbl-targets').textContent = "N/A";
            return;
        }

        counter.textContent = `Sample ${currentSampleIndex + 1} / ${currentFilteredPlans.length}`;
        const planId = currentFilteredPlans[currentSampleIndex];
        const planData = allDemoData[planId];

        // 渲染 Shared Input
        document.getElementById('lbl-plan-id').textContent = planId;
        document.getElementById('lbl-taxonomy').textContent = planData.shared_info.taxonomy_node;
        document.getElementById('lbl-instruction').textContent = planData.shared_info.instruction;
        document.getElementById('lbl-text').textContent = planData.shared_info.text;
        document.getElementById('lbl-targets').textContent = JSON.stringify(planData.shared_info.target_values);

        // 渲染 Model Cards
        container.innerHTML = '';
        
        currentDisplayModels.forEach(model => {
            const modelRes = planData.models[model];
            if (!modelRes) return; // 如果当前样本中没有该模型的结果，则跳过卡片生成

            const evalObj = modelRes.lalm_eval || {};
            const finalScore = evalObj.final_score !== undefined ? parseFloat(evalObj.final_score).toFixed(1) : "NA";
            const ifLevel = evalObj.instruction_following_level !== undefined ? evalObj.instruction_following_level : "NA";
            const natBonus = evalObj.naturalness_bonus;
            const expBonus = evalObj.expressiveness_bonus;

            // 构建卡片折叠面板内容
            let detailsHtml = `<p><strong>Label:</strong> ${evalObj.instruction_following_label || 'NA'}</p>
                               <p><strong>Reason:</strong> ${evalObj.brief_reason || 'NA'}</p>`;
            
            if (evalObj.instruction_evidence) {
                detailsHtml += `<p style="margin-top: 0.5rem"><strong>IF Evidence:</strong></p><ul style="padding-left:1.2rem; margin-top: 0.2rem">`;
                for (const [k, v] of Object.entries(evalObj.instruction_evidence)) {
                    detailsHtml += `<li><b>${k}:</b> ${v}</li>`;
                }
                detailsHtml += `</ul>`;
            }
            
            if (evalObj.bonus_evidence) {
                detailsHtml += `<p style="margin-top: 0.5rem"><strong>Bonus Evidence:</strong></p><ul style="padding-left:1.2rem; margin-top: 0.2rem">`;
                for (const [k, v] of Object.entries(evalObj.bonus_evidence)) {
                    detailsHtml += `<li><b>${k}:</b> ${v}</li>`;
                }
                detailsHtml += `</ul>`;
            }

            // 构建单个卡片 HTML
            const cardHtml = `
                <div class="model-card">
                    <h4>${getDisplayModelName(model)}</h4>
                    <div class="card-metrics">
                        <div class="metric-item">
                            <span class="metric-label">Final Score</span>
                            <span class="metric-val">${finalScore} <span class="metric-delta">${getScoreBadge(finalScore)}</span></span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">IF Level</span>
                            <span class="metric-val">${ifLevel} <span class="metric-delta">${getLevelBadge(ifLevel)}</span></span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">Nat Bonus</span>
                            <span class="metric-val">${getBonusBadge(natBonus)}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">Exp Bonus</span>
                            <span class="metric-val">${getBonusBadge(expBonus)}</span>
                        </div>
                    </div>
                    
                    <audio controls preload="none">
                        <source src="${modelRes.wav_path}">
                        Your browser does not support the audio element.
                    </audio>

                    <details>
                        <summary>📊 View Details</summary>
                        <div class="details-content">
                            ${detailsHtml}
                        </div>
                    </details>
                </div>
            `;
            
            container.insertAdjacentHTML('beforeend', cardHtml);
        });
    }

    // 启动 Demos 引擎
    initDemos();

    // ==========================================
    // 5. Detailed Leaderboard (Heatmap) 逻辑
    // ==========================================
    let detailedData = {};
    let detailedModels = [];
    let detailedCurrentLang = 'en';

    // 颜色映射函数 (红 -> 黄 -> 绿), 分数范围 1.0 - 5.0
    function getHeatmapColor(score) {
        if (!score || isNaN(score)) return "#f8fafc"; // NA 灰色
        const minScore = 1.0;
        const maxScore = 5.0;
        // 归一化到 0 ~ 1
        let ratio = (score - minScore) / (maxScore - minScore);
        ratio = Math.max(0, Math.min(1, ratio));

        // HSL: 0(红) -> 60(黄) -> 120(绿)
        const hue = ratio * 120; 
        // 保持较高的饱和度和明度让颜色清透优雅
        return `hsl(${hue}, 70%, 85%)`; 
    }

    function loadDetailedLeaderboard(lang) {
        const tbody = document.getElementById('heatmap-body');
        const theadRow = document.getElementById('heatmap-header-row');
        const table = document.getElementById('detailed-heatmap-table'); // 获取整个表格元素
        
        // 【关键修改】：不再清空 tbody，而是让表格变半透明，并禁用点击
        table.style.opacity = '0.4';
        table.style.pointerEvents = 'none';

        fetch(`./assets/demos/inst_follow/metadatas/detailed_leaderboard_${lang}.json`)
            .then(res => {
                if(!res.ok) throw new Error("Detailed JSON not found");
                return res.json();
            })
            .then(data => {
                detailedData = data;
                
                let modelsSet = new Set();
                for (let path in data) {
                    Object.keys(data[path]).forEach(m => modelsSet.add(m));
                }
                detailedModels = Array.from(modelsSet).sort((a, b) => {
                    let idxA = preferredModelOrder.indexOf(a);
                    let idxB = preferredModelOrder.indexOf(b);
                    idxA = idxA === -1 ? 999 : idxA;
                    idxB = idxB === -1 ? 999 : idxB;
                    if (idxA !== idxB) return idxA - idxB;
                    return a.localeCompare(b);
                });

                theadRow.innerHTML = `<th class="sticky-col taxonomy-col" style="text-align: left; padding-left: 1rem; width: 350px;">Taxonomy Node</th>`;
                detailedModels.forEach(model => {
                    theadRow.insertAdjacentHTML('beforeend', `<th>${getDisplayModelName(model)}</th>`);
                });

                let paths = Object.keys(data).sort();
                
                tbody.innerHTML = '';
                paths.forEach(path => {
                    const parts = path.split('/');
                    const level = parts.length - 1;
                    const nodeName = formatLabel(parts[parts.length - 1]);
                    
                    const hasChildren = paths.some(p => p.startsWith(path + '/') && p !== path);
                    
                    const tr = document.createElement('tr');
                    tr.className = `level-${level}`;
                    tr.dataset.path = path;
                    tr.dataset.level = level;
                    
                    if (hasChildren) {
                        tr.classList.add('row-expandable');
                    }

                    let taxCellHtml = `<td class="sticky-col taxonomy-col">`;
                    if (hasChildren) {
                        taxCellHtml += `<span class="toggle-icon">▼</span> `;
                    } else {
                        taxCellHtml += `<span style="display:inline-block; width: 20px;"></span>`; 
                    }
                    taxCellHtml += `${nodeName}</td>`;
                    
                    let scoresHtml = '';
                    detailedModels.forEach(model => {
                        const score = data[path][model];
                        const displayScore = score !== undefined ? score.toFixed(2) : '-';
                        const bgColor = getHeatmapColor(score);
                        scoresHtml += `<td class="heatmap-cell" style="background-color: ${bgColor}">${displayScore}</td>`;
                    });

                    tr.innerHTML = taxCellHtml + scoresHtml;

                    if (hasChildren) {
                        tr.addEventListener('click', () => {
                            const icon = tr.querySelector('.toggle-icon');
                            const isCollapsed = icon.classList.contains('collapsed');
                            
                            if (isCollapsed) {
                                icon.classList.remove('collapsed');
                                toggleChildren(path, true);
                            } else {
                                icon.classList.add('collapsed');
                                toggleChildren(path, false);
                            }
                        });
                    }

                    tbody.appendChild(tr);
                });

                // 【关键修改】：数据渲染完毕后，恢复表格的透明度和交互
                table.style.opacity = '1';
                table.style.pointerEvents = 'auto';
            })
            .catch(err => {
                console.error(err);
                tbody.innerHTML = `<tr><td colspan='100%'>Data for ${lang.toUpperCase()} not found.</td></tr>`;
                
                // 出错时也要恢复
                table.style.opacity = '1';
                table.style.pointerEvents = 'auto';
            });
    }

    // 递归隐藏或显示子节点
    function toggleChildren(parentPath, show) {
        const allRows = document.querySelectorAll('#heatmap-body tr');
        const parentLevel = parentPath.split('/').length - 1;

        allRows.forEach(row => {
            const rowPath = row.dataset.path;
            const rowLevel = parseInt(row.dataset.level);
            
            // 只有是该父节点的后代才处理
            if (rowPath.startsWith(parentPath + '/') && rowPath !== parentPath) {
                if (show) {
                    // 如果是展开，只显示直接下一层。
                    // 除非你要做连带展开，通常只展开直系子节点体验更好
                    if (rowLevel === parentLevel + 1) {
                        row.classList.remove('row-hidden');
                        // 展开后，子节点如果也是折叠状态，它的后代要保持隐藏
                        const icon = row.querySelector('.toggle-icon');
                        if (icon && icon.classList.contains('collapsed')) {
                             // Do nothing, its children stay hidden
                        } else if (icon) {
                             // 如果子节点状态是展开的，递归展开它的子节点
                             toggleChildren(rowPath, true);
                        }
                    }
                } else {
                    // 如果是折叠，所有后代全部强制隐藏
                    row.classList.add('row-hidden');
                }
            }
        });
    }

    // 绑定语种切换事件
    const detailedLangTabs = document.querySelectorAll('#detailed-lang-tabs .lang-tab');
    detailedLangTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            detailedLangTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            const newLang = e.target.getAttribute('data-lang');
            if (newLang !== detailedCurrentLang) {
                detailedCurrentLang = newLang;
                loadDetailedLeaderboard(newLang);
            }
        });
    });

    // 初始加载 Detailed Leaderboard
    loadDetailedLeaderboard(detailedCurrentLang);

    // ==========================================
    // Hero 区域 Summary 双雷达图 (中英全模型对比)
    // ==========================================
    function initDualRadarCharts() {
        const labels = [
            'Overall avg', 'Timbre avg', 'Style avg', 'Tag', 'Direct', 
            'Simple-comp', 'Multi-comp', 'Dynamic', 'Layered', 'Conflict', 
            'Scenario', 'Character', 'Disfluency', 'Dysphonia', 'Implicit', 'Explicit'
        ];

        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: 20 },
            scales: {
                r: {
                    min: 0.5, max: 3.0, stepSize: 0.5,
                    angleLines: { color: 'rgba(0,0,0,0.05)' },
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    pointLabels: { font: { size: 9, weight: '600', family: 'system-ui' }, color: '#475569' },
                    ticks: { backdropColor: 'transparent', font: { size: 8 }, color: '#cbd5e1' }
                }
            },
            plugins: {
                legend: { 
                    position: 'bottom', 
                    labels: { boxWidth: 10, padding: 8, font: { size: 9, family: 'system-ui' }, usePointStyle: true } 
                },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 8, cornerRadius: 6 }
            }
        };

        // 调色盘
        const colors = {
            flash: '#2563eb', pro: '#60a5fa', eleven: '#ec4899', qwen: '#10b981', 
            minimax: '#f59e0b', moss: '#8b5cf6', ming16: '#14b8a6', ming05: '#4ade80', 
            mimo: '#eab308', hume: '#6366f1', gpt4o: '#a855f7', parlerL: '#94a3b8', 
            parlerM: '#cbd5e1', voiceS: '#f43f5e'
        };

        // --- 1. 中文雷达图 (ZH 11个模型) ---
        // Top 3 (Qwen3, Gemini Pro, Gemini Flash) 默认显示
        const ctxZh = document.getElementById('chineseRadarChart');
        if (ctxZh) {
            new Chart(ctxZh, {
                type: 'radar',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Qwen3TTS-1.7B (OS)', data: [2.16, 2.29, 2.23, 2.27, 2.33, 2.69, 2.25, 1.64, 1.98, 1.85, 1.89, 1.89, 1.20, 2.67, 2.03, 1.69], borderColor: colors.qwen, backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 2.5, borderDash: [4,4] },
                        { label: 'Gemini 2.5-Pro (Comm)', data: [2.13, 2.20, 2.22, 2.12, 2.29, 2.44, 2.20, 2.01, 1.85, 2.11, 1.44, 1.78, 1.70, 2.71, 2.41, 2.31], borderColor: colors.pro, borderWidth: 2.5 },
                        { label: 'Gemini 2.5-Flash (Comm)', data: [2.09, 2.09, 2.11, 2.02, 2.21, 2.44, 2.25, 2.01, 1.73, 1.48, 1.89, 1.88, 1.55, 2.58, 2.41, 2.28], borderColor: colors.flash, borderWidth: 2.5 },
                        { label: 'ElevenLabs-v3 (Comm)', data: [1.98, 2.23, 1.96, 2.23, 2.05, 2.30, 2.11, 1.34, 1.89, 1.73, 1.87, 2.09, 0.87, 1.90, 1.14, 2.12], borderColor: colors.eleven, borderWidth: 1.5, hidden: true },
                        { label: 'MiniMax-2.7 (Comm)', data: [1.95, 2.17, 2.07, 2.08, 2.05, 2.49, 2.18, 1.76, 1.95, 1.80, 1.91, 1.73, 1.05, 1.75, 1.25, 1.06], borderColor: colors.minimax, borderWidth: 1.5, hidden: true },
                        { label: 'Ming-Omni-16.8B (OS)', data: [1.95, 2.10, 2.06, 2.12, 2.02, 2.44, 2.16, 1.91, 1.82, 1.64, 1.72, 1.80, 1.00, 1.67, 1.66, 1.06], borderColor: colors.ming16, borderWidth: 1.5, borderDash: [4,4], hidden: true },
                        { label: 'MOSS-Voice (OS)', data: [1.93, 1.98, 2.00, 2.00, 1.92, 2.14, 2.27, 1.46, 1.90, 1.96, 1.59, 1.77, 1.30, 2.33, 1.97, 1.81], borderColor: colors.moss, borderWidth: 1.5, borderDash: [4,4], hidden: true },
                        { label: 'Ming-Omni-0.5B (OS)', data: [1.87, 2.04, 2.01, 1.95, 1.96, 2.39, 2.24, 1.68, 1.72, 1.65, 1.56, 1.82, 1.00, 1.55, 1.35, 1.07], borderColor: colors.ming05, borderWidth: 1.5, borderDash: [4,4], hidden: true },
                        { label: 'MiMo-Audio (OS)', data: [1.75, 1.78, 1.83, 1.86, 1.78, 2.14, 1.74, 1.62, 1.33, 1.68, 1.76, 1.51, 1.40, 2.33, 1.72, 1.22], borderColor: colors.mimo, borderWidth: 1.5, borderDash: [4,4], hidden: true },
                        { label: 'VoiceSculptor (OS)', data: [1.59, 1.55, 1.62, 1.63, 1.41, 1.87, 1.69, 1.60, 1.78, 1.25, 1.42, 1.59, 1.25, 2.46, 1.75, 1.09], borderColor: colors.voiceS, borderWidth: 1.5, borderDash: [4,4], hidden: true },
                        { label: 'GPT-4o-Mini-TTS (Comm)', data: [1.56, 1.58, 1.63, 1.53, 1.76, 1.77, 1.59, 1.78, 1.20, 1.39, 1.20, 1.33, 1.11, 1.96, 1.62, 1.47], borderColor: colors.gpt4o, borderWidth: 1.5, hidden: true }
                    ]
                },
                options: commonOptions
            });
        }

        // --- 2. 英文雷达图 (EN 13个模型) ---
        // Top 3 (Gemini Flash, Gemini Pro, ElevenLabs) 默认显示
        const ctxEn = document.getElementById('englishRadarChart');
        if (ctxEn) {
            new Chart(ctxEn, {
                type: 'radar',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Gemini 2.5-Flash (Comm)', data: [2.44, 2.33, 2.59, 2.50, 2.53, 2.65, 2.50, 2.24, 2.46, 2.31, 2.28, 2.17, 1.95, 2.62, 2.56, 2.31], borderColor: colors.flash, backgroundColor: 'rgba(37,99,235,0.1)', borderWidth: 2.5 },
                        { label: 'Gemini 2.5-Pro (Comm)', data: [2.39, 2.34, 2.53, 2.47, 2.51, 2.52, 2.44, 2.35, 2.23, 2.40, 2.22, 2.05, 1.90, 2.71, 2.31, 2.35], borderColor: colors.pro, borderWidth: 2.5 },
                        { label: 'ElevenLabs-v3 (Comm)', data: [2.23, 2.53, 2.23, 2.49, 2.34, 2.62, 2.24, 1.81, 2.18, 2.12, 2.48, 2.42, 0.77, 1.43, 1.21, 2.21], borderColor: colors.eleven, borderWidth: 2.5 },
                        { label: 'Qwen3TTS-1.7B (OS)', data: [2.12, 2.28, 2.16, 2.20, 2.13, 2.44, 2.35, 1.57, 2.11, 2.15, 2.06, 2.12, 1.20, 2.21, 1.81, 1.59], borderColor: colors.qwen, borderWidth: 1.5, borderDash: [4,4], hidden: true },
                        { label: 'MiniMax-2.7 (Comm)', data: [1.95, 2.12, 2.04, 2.07, 1.99, 2.35, 2.27, 1.53, 1.57, 2.07, 2.06, 2.09, 1.00, 1.08, 1.26, 1.00], borderColor: colors.minimax, borderWidth: 1.5, hidden: true },
                        { label: 'MOSS-Voice (OS)', data: [1.90, 2.01, 1.99, 1.97, 1.90, 2.29, 2.01, 1.71, 1.90, 2.11, 1.76, 1.74, 1.30, 2.04, 1.97, 1.16], borderColor: colors.moss, borderWidth: 1.5, borderDash: [4,4], hidden: true },
                        { label: 'Hume-Octave1 (Comm)', data: [1.86, 2.08, 1.95, 2.10, 2.08, 2.22, 2.00, 1.65, 1.52, 1.44, 1.97, 1.74, 1.00, 1.00, 1.00, 1.03], borderColor: colors.hume, borderWidth: 1.5, hidden: true },
                        { label: 'MiMo-Audio (OS)', data: [1.75, 1.80, 1.83, 1.87, 1.79, 2.03, 1.95, 1.44, 1.25, 1.71, 1.89, 1.63, 1.05, 1.96, 1.47, 1.03], borderColor: colors.mimo, borderWidth: 1.5, borderDash: [4,4], hidden: true },
                        { label: 'GPT-4o-Mini-TTS (Comm)', data: [1.69, 1.70, 1.78, 1.63, 1.83, 1.74, 1.81, 1.72, 1.74, 1.87, 1.61, 1.47, 1.30, 1.88, 1.62, 1.59], borderColor: colors.gpt4o, borderWidth: 1.5, hidden: true },
                        { label: 'Ming-Omni-16.8B (OS)', data: [1.51, 1.68, 1.58, 1.70, 1.61, 1.99, 1.41, 1.60, 1.27, 1.20, 1.56, 1.31, 1.00, 1.00, 1.03, 1.12], borderColor: colors.ming16, borderWidth: 1.5, borderDash: [4,4], hidden: true },
                        { label: 'Ming-Omni-0.5B (OS)', data: [1.41, 1.55, 1.46, 1.62, 1.46, 1.69, 1.41, 1.33, 1.08, 1.23, 1.20, 1.27, 1.00, 1.04, 1.06, 1.00], borderColor: colors.ming05, borderWidth: 1.5, borderDash: [4,4], hidden: true },
                        { label: 'Parler-TTS Large (OS)', data: [1.38, 1.61, 1.49, 1.45, 1.65, 1.74, 1.64, 0.85, 1.35, 1.15, 0.93, 0.94, 1.15, 1.92, 1.06, 1.00], borderColor: colors.parlerL, borderWidth: 1.5, borderDash: [4,4], hidden: true },
                        { label: 'Parler-TTS Mini (OS)', data: [1.04, 1.11, 1.13, 1.18, 1.28, 1.00, 1.23, 0.75, 0.90, 0.73, 0.45, 0.51, 1.00, 2.33, 1.12, 1.00], borderColor: colors.parlerM, borderWidth: 1.5, borderDash: [4,4], hidden: true }
                    ]
                },
                options: commonOptions
            });
        }
    }

    initDualRadarCharts()

    
    // ==========================================
    // Timbre Diversity 音频演示功能
    // ==========================================
    let tdsDataEN = {};
    let tdsDataZH = {};

    function getTDSAudioPath(path) {
        if (/^(https?:)?\/\//.test(path) || path.startsWith('/')) return path;
        return `./${path.replace(/^\.\//, '')}`;
    }

    function getSortedTDSModelKeys() {
        const allModelKeys = new Set([...Object.keys(tdsDataEN), ...Object.keys(tdsDataZH)]);
        return Array.from(allModelKeys).sort((a, b) => {
            const idxA = preferredModelOrder.indexOf(a);
            const idxB = preferredModelOrder.indexOf(b);
            const valA = idxA === -1 ? 999 : idxA;
            const valB = idxB === -1 ? 999 : idxB;
            if (valA !== valB) return valA - valB;
            return a.localeCompare(b);
        });
    }

    function fillTDSModelSelector(modelKeys) {
        const selectEl = document.getElementById('tds-model-select');
        if (!selectEl) return;

        selectEl.innerHTML = '';
        modelKeys.forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = getDisplayModelName(key);
            selectEl.appendChild(option);
        });
    }

    async function loadTDSData() {
        const selectEl = document.getElementById('tds-model-select');
        const loadingIndicator = document.getElementById('tds-loading-indicator');
        if (!selectEl || !loadingIndicator) return;

        try {
            loadingIndicator.style.display = 'inline';

            const [respEN, respZH] = await Promise.all([
                fetch('./assets/demos/timbre_diversity/metadata/tds_en.json'),
                fetch('./assets/demos/timbre_diversity/metadata/tds_zh.json')
            ]);

            if (!respEN.ok) {
                throw new Error(`EN fetch failed with status ${respEN.status}`);
            }
            if (!respZH.ok) {
                throw new Error(`ZH fetch failed with status ${respZH.status}`);
            }

            [tdsDataEN, tdsDataZH] = await Promise.all([respEN.json(), respZH.json()]);

            const sortedKeys = getSortedTDSModelKeys();
            if (sortedKeys.length === 0) {
                throw new Error('No TDS models found in metadata');
            }

            fillTDSModelSelector(sortedKeys);
            selectEl.value = sortedKeys[0];
            renderTDSAudio(sortedKeys[0]);
        } catch (err) {
            console.error('Failed to load TDS metadata:', err);
            selectEl.innerHTML = '<option value="">Failed to load data</option>';
            document.getElementById('tds-en-meta').innerHTML = '<p style="color: #94a3b8; margin: 0;">Failed to load English TDS metadata.</p>';
            document.getElementById('tds-zh-meta').innerHTML = '<p style="color: #94a3b8; margin: 0;">Failed to load Chinese TDS metadata.</p>';
            document.getElementById('tds-en-samples').innerHTML = '<p style="color: #94a3b8;">Failed to load English TDS samples.</p>';
            document.getElementById('tds-zh-samples').innerHTML = '<p style="color: #94a3b8;">Failed to load Chinese TDS samples.</p>';
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }

    function renderTDSMeta(containerId, sampleData, emptyMessage) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!sampleData) {
            container.innerHTML = `<p style="color: #94a3b8; margin: 0;">${emptyMessage}</p>`;
            return;
        }

        container.innerHTML = `
            <p style="margin: 0 0 0.5rem 0;"><strong>Instruction:</strong> ${sampleData.instruction || 'N/A'}</p>
            <p style="margin: 0;"><strong>Text:</strong> ${sampleData.text || 'N/A'}</p>
        `;
    }

    function renderTDSAudio(modelKey) {
        const enContainer = document.getElementById('tds-en-samples');
        const zhContainer = document.getElementById('tds-zh-samples');
        if (!enContainer || !zhContainer) return;

        const displayName = getDisplayModelName(modelKey);

        const enSampleData = tdsDataEN?.[modelKey] || null;
        const enPaths = enSampleData?.wav_paths || [];
        renderTDSMeta('tds-en-meta', enSampleData, 'No English TDS metadata available.');
        if (enPaths.length > 0) {
            enContainer.innerHTML = '';
            enPaths.forEach((path, idx) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'tds-audio-item';
                itemDiv.innerHTML = `
                    <span style="min-width: 40px; color: #64748b;">#${idx+1}</span>
                    <audio controls preload="none">
                        <source src="${getTDSAudioPath(path)}" type="audio/mpeg">
                        Your browser does not support the audio element.
                    </audio>
                `;
                enContainer.appendChild(itemDiv);
            });
        } else {
            enContainer.innerHTML = `<p style="color: #94a3b8;">No English TDS samples available for ${displayName}.</p>`;
        }

        const zhSampleData = tdsDataZH?.[modelKey] || null;
        const zhPaths = zhSampleData?.wav_paths || [];
        renderTDSMeta('tds-zh-meta', zhSampleData, 'No Chinese TDS metadata available.');
        if (zhPaths.length > 0) {
            zhContainer.innerHTML = '';
            zhPaths.forEach((path, idx) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'tds-audio-item';
                itemDiv.innerHTML = `
                    <span style="min-width: 40px; color: #64748b;">#${idx+1}</span>
                    <audio controls preload="none">
                        <source src="${getTDSAudioPath(path)}" type="audio/mpeg">
                        Your browser does not support the audio element.
                    </audio>
                `;
                zhContainer.appendChild(itemDiv);
            });
        } else {
            zhContainer.innerHTML = `<p style="color: #94a3b8;">No Chinese TDS samples available for ${displayName}.</p>`;
        }
    }

    function initTDSAudioSelector() {
        const selectEl = document.getElementById('tds-model-select');
        if (!selectEl) return;

        selectEl.addEventListener('change', (e) => {
            const modelKey = e.target.value;
            if (modelKey) {
                renderTDSAudio(modelKey);
            }
        });
    }

    initTDSAudioSelector();
    loadTDSData();

});