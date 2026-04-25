/* ========================================
   OpoTest — Application Logic
   ======================================== */

(function () {
    'use strict';

    // ========================================
    // State
    // ========================================
    let allQuestions = [];
    let currentView = 'home';
    let currentTestType = null; // 'comun', 'especifico', 'completo'
    let quizQuestions = [];
    let quizIndex = 0;
    let quizCorrect = 0;
    let quizWrong = 0;
    let sessionCorrect = 0;
    let sessionWrong = 0;
    let sessionFallos = []; // { question, selectedIndex }
    let answered = false;
    let estudioFilter = 'todas';
    let estudioSearch = '';
    let estudioDisplayCount = 30;
    let lastQuizConfig = null; // for retry
    let isFallosMode = false;

    // ========================================
    // DOM References
    // ========================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const sidebar = $('#sidebar');
    const menuToggle = $('#menu-toggle');
    const sidebarClose = $('#sidebar-close');
    const navItems = $$('.nav-item');
    const homeCards = $$('.home-card');

    // Views
    const views = {
        home: $('#view-home'),
        'test-selector': $('#view-test-selector'),
        quiz: $('#view-quiz'),
        results: $('#view-results'),
        fallos: $('#view-fallos'),
        estudio: $('#view-estudio'),
        'test-ordenado': $('#view-test-ordenado'),
    };

    // ========================================
    // Load Questions
    // ========================================
    async function loadQuestions() {
        try {
            const response = await fetch('bateria.json');
            allQuestions = await response.json();
            console.log(`Loaded ${allQuestions.length} questions`);
        } catch (err) {
            console.error('Error loading questions:', err);
            allQuestions = [];
        }
    }

    // ========================================
    // Navigation
    // ========================================
    function showView(viewName) {
        Object.values(views).forEach((v) => v.classList.remove('active'));
        const target = views[viewName];
        if (target) {
            target.classList.add('active');
        }

        // Update nav active state
        const navMap = {
            home: 'home',
            'test-selector': currentTestType ? `test-${currentTestType === 'completo' ? 'completo' : currentTestType}` : 'home',
            quiz: currentTestType ? `test-${currentTestType === 'completo' ? 'completo' : currentTestType}` : 'home',
            results: currentTestType ? `test-${currentTestType === 'completo' ? 'completo' : currentTestType}` : 'home',
            fallos: 'fallos',
            estudio: 'estudio',
        };

        const activeNav = navMap[viewName] || 'home';
        navItems.forEach((item) => {
            item.classList.toggle('active', item.dataset.view === activeNav ||
                (activeNav === 'test-comun' && item.dataset.view === 'test-comun') ||
                (activeNav === 'test-especifico' && item.dataset.view === 'test-especifico') ||
                (activeNav === 'test-completo' && item.dataset.view === 'test-completo'));
        });

        // Update topbar title
        const titles = {
            home: 'Inicio',
            'test-selector': `Test ${capitalize(currentTestType || '')}`,
            'test-ordenado': 'Test Ordenado',
            quiz: `Test ${capitalize(currentTestType || '')}`,
            results: 'Resultados',
            fallos: 'Repasar Fallos',
            estudio: 'Modo Estudio',
        };
        $('#topbar-title').textContent = titles[viewName] || 'OpoTest';

        // Initialize icons
        lucide.createIcons();

        // Close sidebar on mobile
        closeSidebar();

        currentView = viewName;
    }

    function capitalize(str) {
        if (str === 'comun') return 'Común';
        if (str === 'especifico') return 'Específico';
        if (str === 'completo') return 'Completo';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // ========================================
    // Sidebar Toggle (Mobile)
    // ========================================
    function openSidebar() {
        sidebar.classList.add('open');
        getOrCreateOverlay().classList.add('active');
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    function getOrCreateOverlay() {
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            overlay.addEventListener('click', closeSidebar);
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    // ========================================
    // Theme
    // ========================================
    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    // ========================================
    // Stats Update
    // ========================================
    function updateGlobalStats() {
        const sidebarCorrect = $('#sidebar-correct');
        const sidebarWrong = $('#sidebar-wrong');
        if (sidebarCorrect) sidebarCorrect.textContent = sessionCorrect;
        if (sidebarWrong) sidebarWrong.textContent = sessionWrong;

        // Update fallos badge
        const badge = $('#fallos-badge');
        if (sessionFallos.length > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = sessionFallos.length;
        } else {
            badge.style.display = 'none';
        }
    }

    // ========================================
    // Test Selector
    // ========================================
    function openTestSelector(type) {
        currentTestType = type;
        const title = {
            comun: '📘 Test Común',
            especifico: '📗 Test Específico',
            completo: '📙 Test Completo',
        };
        $('#selector-title').textContent = title[type] || 'Test';
        
        // Show/hide "Test Ordenado" only for "Común"
        const btnOrdenado = $('#btn-test-ordenado');
        if (btnOrdenado) {
            btnOrdenado.style.display = type === 'comun' ? 'flex' : 'none';
        }
        
        showView('test-selector');
    }

    function openTestOrdenado() {
        showView('test-ordenado');
    }

    // ========================================
    // Quiz Logic
    // ========================================
    function getQuestionPool(type) {
        if (type === 'comun') return allQuestions.filter((q) => q.categoria === 'comun');
        if (type === 'especifico') return allQuestions.filter((q) => q.categoria === 'especifico');
        return [...allQuestions];
    }

    function shuffleArray(arr) {
        const shuffled = [...arr];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    function startQuiz(type, count) {
        const pool = getQuestionPool(type);
        const actualCount = Math.min(count, pool.length);
        quizQuestions = shuffleArray(pool).slice(0, actualCount);
        quizIndex = 0;
        quizCorrect = 0;
        quizWrong = 0;
        answered = false;
        lastQuizConfig = { type, count };
        isFallosMode = false;

        showView('quiz');
        renderQuestion();
    }

    function startQuizWithQuestions(questions, isOrdered = false) {
        if (isOrdered) {
            quizQuestions = [...questions]; // Don't shuffle
        } else {
            quizQuestions = shuffleArray([...questions]);
        }
        quizIndex = 0;
        quizCorrect = 0;
        quizWrong = 0;
        answered = false;
        lastQuizConfig = null;
        isFallosMode = !isOrdered;

        showView('quiz');
        renderQuestion();
    }

    function startOrderedQuiz(start, end) {
        const pool = getQuestionPool('comun');
        const selectedQuestions = pool.filter(q => q.id >= start && q.id <= end);
        
        lastQuizConfig = { type: 'ordenado', start, end };
        startQuizWithQuestions(selectedQuestions, true);
    }

    function renderQuestion() {
        if (quizIndex >= quizQuestions.length) {
            showResults();
            return;
        }

        answered = false;
        const q = quizQuestions[quizIndex];
        const total = quizQuestions.length;

        // Progress
        $('#quiz-counter').textContent = `${quizIndex + 1} / ${total}`;
        $('#quiz-progress-fill').style.width = `${((quizIndex + 1) / total) * 100}%`;

        // Scores
        $('#quiz-score-correct').textContent = `✓ ${quizCorrect}`;
        $('#quiz-score-wrong').textContent = `✗ ${quizWrong}`;

        // Category badge
        const badge = $('#question-category-badge');
        badge.textContent = q.categoria === 'comun' ? 'Común' : 'Específico';
        badge.className = `question-category-badge ${q.categoria}`;

        // Question text
        $('#question-text').textContent = q.pregunta;

        // Options
        const optionsList = $('#options-list');
        optionsList.innerHTML = '';
        const letters = ['A', 'B', 'C', 'D'];

        q.opciones.forEach((opcion, i) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.innerHTML = `
                <span class="option-letter">${letters[i]}</span>
                <span class="option-text">${opcion}</span>
            `;
            btn.addEventListener('click', () => selectOption(i));
            optionsList.appendChild(btn);
        });

        // Hide next button
        $('#btn-next').style.display = 'none';

        // Initialize icons
        lucide.createIcons();

        // Re-animate question card
        const card = $('#question-card');
        card.style.animation = 'none';
        requestAnimationFrame(() => {
            card.style.animation = 'scaleIn 0.3s ease';
        });
    }

    function selectOption(selectedIndex) {
        if (answered) return;
        answered = true;

        const q = quizQuestions[quizIndex];
        const correctIndex = q.respuesta_correcta;
        const buttons = $$('.option-btn');

        // Disable all buttons
        buttons.forEach((btn) => btn.classList.add('disabled'));

        // Mark correct
        buttons[correctIndex].classList.add('correct');

        if (selectedIndex === correctIndex) {
            // Correct answer
            quizCorrect++;
            sessionCorrect++;

            // If in fallos mode, remove the question from fallos list
            if (isFallosMode) {
                sessionFallos = sessionFallos.filter(f => f.question.id !== q.id);
            }
        } else {
            // Wrong answer
            buttons[selectedIndex].classList.add('wrong');
            quizWrong++;
            sessionWrong++;

            // Check if already in fallos to avoid duplicates
            const existingFalloIdx = sessionFallos.findIndex(f => f.question.id === q.id);
            if (existingFalloIdx !== -1) {
                // Update with latest wrong answer
                sessionFallos[existingFalloIdx].selectedIndex = selectedIndex;
            } else {
                // Add new fallo
                sessionFallos.push({
                    question: q,
                    selectedIndex: selectedIndex,
                });
            }
        }

        updateGlobalStats();

        // Show next button or auto-advance after delay
        $('#btn-next').style.display = 'flex';
    }

    function nextQuestion() {
        quizIndex++;
        renderQuestion();
    }

    // ========================================
    // Results
    // ========================================
    function showResults() {
        showView('results');

        const total = quizQuestions.length;
        const percent = total > 0 ? Math.round((quizCorrect / total) * 100) : 0;

        $('#results-correct').textContent = quizCorrect;
        $('#results-wrong').textContent = quizWrong;
        $('#results-total').textContent = total;
        $('#results-percent').textContent = `${percent}%`;

        // Animate ring
        const circumference = 339.292;
        const offset = circumference - (percent / 100) * circumference;
        const ring = $('#score-ring-fill');

        // Reset then animate
        ring.style.transition = 'none';
        ring.style.strokeDashoffset = circumference;

        // Change color based on score
        if (percent >= 70) {
            ring.style.stroke = 'var(--correct-border)';
        } else if (percent >= 50) {
            ring.style.stroke = 'var(--accent-completo)';
        } else {
            ring.style.stroke = 'var(--wrong-border)';
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                ring.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)';
                ring.style.strokeDashoffset = offset;
            });
        });
    }

    // ========================================
    // Fallos View
    // ========================================
    function renderFallos() {
        const list = $('#fallos-list');
        const empty = $('#fallos-empty');
        const actions = $('#fallos-actions');

        if (sessionFallos.length === 0) {
            empty.style.display = 'block';
            actions.style.display = 'none';
            list.innerHTML = '';
            return;
        }

        empty.style.display = 'none';
        actions.style.display = 'flex';
        $('#fallos-description').textContent = `Tienes ${sessionFallos.length} pregunta${sessionFallos.length !== 1 ? 's' : ''} fallada${sessionFallos.length !== 1 ? 's' : ''} en esta sesión`;

        const letters = ['A', 'B', 'C', 'D'];
        list.innerHTML = sessionFallos.map((fallo, idx) => {
            const q = fallo.question;
            const icon = q.categoria === 'comun' ? 'book-text' : 'book';
            return `
                <div class="fallo-item" style="animation-delay: ${idx * 0.05}s">
                    <div class="fallo-item-header">
                        <span class="fallo-category ${q.categoria}">
                            <i data-lucide="${icon}" class="badge-icon"></i>
                            ${q.categoria === 'comun' ? 'Común' : 'Específico'}
                        </span>
                    </div>
                    <p class="fallo-question">${q.pregunta}</p>
                    <div class="fallo-answer your-answer">
                        <span class="fallo-answer-label">Tu respuesta (${letters[fallo.selectedIndex]}):</span>
                        ${q.opciones[fallo.selectedIndex]}
                    </div>
                    <div class="fallo-answer correct-answer">
                        <span class="fallo-answer-label">Correcta (${letters[q.respuesta_correcta]}):</span>
                        ${q.opciones[q.respuesta_correcta]}
                    </div>
                </div>
            `;
        }).join('');

        lucide.createIcons();
    }

    // ========================================
    // Estudio View
    // ========================================
    function getFilteredEstudioQuestions() {
        let filtered = [...allQuestions];

        if (estudioFilter !== 'todas') {
            filtered = filtered.filter((q) => q.categoria === estudioFilter);
        }

        if (estudioSearch.trim()) {
            const search = estudioSearch.trim().toLowerCase();
            filtered = filtered.filter((q) =>
                q.pregunta.toLowerCase().includes(search) ||
                q.opciones.some((o) => o.toLowerCase().includes(search))
            );
        }

        return filtered;
    }

    function renderEstudio() {
        const questions = getFilteredEstudioQuestions();
        const displayQuestions = questions.slice(0, estudioDisplayCount);
        const list = $('#estudio-list');

        $('#estudio-count').textContent = `Mostrando ${Math.min(estudioDisplayCount, questions.length)} de ${questions.length} preguntas`;

        const letters = ['A', 'B', 'C', 'D'];
        let html = displayQuestions.map((q) => {
            const icon = q.categoria === 'comun' ? 'book-text' : 'book';
            return `
                <div class="estudio-item" data-id="${q.id}">
                    <div class="estudio-item-header">
                        <span class="estudio-item-number">#${q.id}</span>
                        <span class="estudio-item-question">${q.pregunta}</span>
                        <span class="estudio-item-badge ${q.categoria}">
                            <i data-lucide="${icon}" class="badge-icon"></i>
                        </span>
                    </div>
                    <div class="estudio-item-options">
                        ${q.opciones.map((opt, i) => `
                            <div class="estudio-option ${i === q.respuesta_correcta ? 'correct-option' : ''}">
                                <span class="estudio-option-letter">${letters[i]})</span>
                                <span>${opt}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        // Load more button
        if (questions.length > estudioDisplayCount) {
            html += `
                <div class="load-more-container">
                    <button class="btn-load-more" id="btn-load-more">
                        <i data-lucide="chevron-down" class="btn-icon"></i>
                        Cargar más preguntas (${questions.length - estudioDisplayCount} restantes)
                    </button>
                </div>
            `;
        }

        list.innerHTML = html;
        lucide.createIcons();

        // Attach toggle events
        list.querySelectorAll('.estudio-item').forEach((item) => {
            item.addEventListener('click', () => {
                item.classList.toggle('expanded');
            });
        });

        // Attach load more event
        const loadMoreBtn = list.querySelector('#btn-load-more');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                estudioDisplayCount += 30;
                renderEstudio();
            });
        }
    }

    // ========================================
    // Event Listeners
    // ========================================
    function setupEventListeners() {
        // Menu toggle (mobile)
        menuToggle.addEventListener('click', openSidebar);
        sidebarClose.addEventListener('click', closeSidebar);

        // Sidebar nav
        navItems.forEach((item) => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                if (view === 'home') {
                    showView('home');
                } else if (view === 'test-comun') {
                    openTestSelector('comun');
                } else if (view === 'test-especifico') {
                    openTestSelector('especifico');
                } else if (view === 'test-completo') {
                    openTestSelector('completo');
                } else if (view === 'fallos') {
                    renderFallos();
                    showView('fallos');
                } else if (view === 'estudio') {
                    estudioDisplayCount = 30;
                    renderEstudio();
                    showView('estudio');
                }
            });
        });

        // Home cards
        homeCards.forEach((card) => {
            card.addEventListener('click', () => {
                const action = card.dataset.action;
                if (action === 'test-comun') {
                    openTestSelector('comun');
                } else if (action === 'test-especifico') {
                    openTestSelector('especifico');
                } else if (action === 'test-completo') {
                    openTestSelector('completo');
                } else if (action === 'fallos') {
                    renderFallos();
                    showView('fallos');
                } else if (action === 'estudio') {
                    estudioDisplayCount = 30;
                    renderEstudio();
                    showView('estudio');
                }
            });
        });

        // Test selector
        $('#selector-back').addEventListener('click', () => showView('home'));
        $('#btn-test-rapido').addEventListener('click', () => startQuiz(currentTestType, 10));
        $('#btn-test-completo').addEventListener('click', () => startQuiz(currentTestType, 100));
        $('#btn-test-ordenado').addEventListener('click', () => openTestOrdenado());

        // Test Ordenado
        $('#ordenado-back').addEventListener('click', () => openTestSelector('comun'));
        $$('.block-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const start = parseInt(btn.dataset.start);
                const end = parseInt(btn.dataset.end);
                startOrderedQuiz(start, end);
            });
        });

        // Quiz
        $('#quiz-back').addEventListener('click', () => {
            if (confirm('¿Seguro que quieres salir del test? Perderás el progreso de este test.')) {
                showView('home');
            }
        });
        $('#btn-next').addEventListener('click', nextQuestion);

        // Results
        $('#btn-retry').addEventListener('click', () => {
            if (lastQuizConfig) {
                if (lastQuizConfig.type === 'ordenado') {
                    startOrderedQuiz(lastQuizConfig.start, lastQuizConfig.end);
                } else {
                    startQuiz(lastQuizConfig.type, lastQuizConfig.count);
                }
            } else {
                showView('home');
            }
        });
        $('#btn-review-mistakes').addEventListener('click', () => {
            renderFallos();
            showView('fallos');
        });
        $('#btn-go-home').addEventListener('click', () => showView('home'));

        // Fallos
        $('#btn-test-fallos').addEventListener('click', () => {
            if (sessionFallos.length === 0) return;
            const falloQuestions = sessionFallos.map((f) => f.question);
            currentTestType = 'completo';
            startQuizWithQuestions(falloQuestions);
        });
        $('#btn-clear-fallos').addEventListener('click', () => {
            if (confirm('¿Borrar todos los fallos de esta sesión?')) {
                sessionFallos = [];
                updateGlobalStats();
                renderFallos();
            }
        });

        // Theme Toggle
        const themeToggle = $('#theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }

        // Estudio - Search
        $('#estudio-search').addEventListener('input', (e) => {
            estudioSearch = e.target.value;
            estudioDisplayCount = 30;
            renderEstudio();
        });

        // Estudio - Filters
        $$('.filter-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('.filter-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                estudioFilter = btn.dataset.filter;
                estudioDisplayCount = 30;
                renderEstudio();
            });
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (currentView === 'quiz' && !answered) {
                const keyMap = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 };
                const index = keyMap[e.key.toLowerCase()];
                if (index !== undefined) {
                    selectOption(index);
                }
            }
            if (currentView === 'quiz' && answered && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) {
                e.preventDefault();
                nextQuestion();
            }
        });
    }

    // ========================================
    // Init
    // ========================================
    async function init() {
        initTheme();
        await loadQuestions();
        setupEventListeners();
        updateGlobalStats();
        showView('home');
        lucide.createIcons();
    }

    // Start app
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
