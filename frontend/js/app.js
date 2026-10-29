// VISHAL SINGH - AI Learning Platform
// Client Application Architecture
import { API } from './api.js';

export const App = {
  state: {
    currentPage: 'dashboard',
    theme: 'dark',
    subjects: [],
    currentSubject: null,
    currentDoc: null,
    currentDocId: null,
    currentSlideNumber: 1,
    currentSummary: null,
    currentSession: null,
    activeConceptIndex: 0,
    activeConceptName: '',
    selectedUploadFile: null,
    uploadTargetSubjectId: null,
    newUploadedDocId: null,
    chatMessages: [],

    // Original PPT Viewer State
    slidesData: {
      slides: [],
      totalSlides: 0,
      currentIndex: 0,
      zoomLevel: 1.0,
      downloadUrl: null,
      loaded: false
    },

    // Concept Quiz State (5 Questions per Concept)
    quizState: {
      catalog: [],
      currentConcept: '',
      prepData: null,
      activeQuiz: null,
      currentQuestionIndex: 0,
      userAnswers: {}, // { question_id: [selectedIndices] }
      startTime: null,
      timerInterval: null,
      elapsedSeconds: 0,
      lastResult: null,
      isSubmitting: false
    },

    // Active Study Time Tracker
    studyTimer: {
      active: false,
      currentDocId: null,
      elapsedSeconds: 0,
      unrecordedSeconds: 0,
      lastActivityTime: Date.now(),
      isPaused: false,
      intervalId: null
    },

    // Learning Progress Analytics
    learningAnalytics: null
  },

  async init() {
    console.log('Initializing VISHAL SINGH LMS...');
    this.initTheme();
    this.initLucide();
    this.initStudyTimerListeners();

    // Check authentication session
    const token = localStorage.getItem('vishal_lms_token');
    try {
      const auth = await API.getCurrentUser(token);
      if (auth && auth.authenticated && auth.user) {
        const nameEl = document.getElementById('header-user-name');
        if (nameEl) nameEl.innerText = auth.user.full_name || 'Vishal Singh';
      }
    } catch (e) {
      console.warn('Auth check notice:', e);
    }

    await this.loadDashboard();
    window.App = this;
  },

  initLucide() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  // ==================== THEME MANAGEMENT ====================
  initTheme() {
    const savedTheme = localStorage.getItem('vishal_lms_theme') || 'dark';
    this.setTheme(savedTheme);
  },

  setTheme(theme) {
    this.state.theme = theme;
    localStorage.setItem('vishal_lms_theme', theme);
    const body = document.body;
    const html = document.documentElement;
    const icon = document.getElementById('theme-toggle-icon');

    if (theme === 'dark') {
      body.classList.add('dark-mode');
      html.classList.add('dark');
      if (icon) icon.setAttribute('data-lucide', 'sun');
    } else {
      body.classList.remove('dark-mode');
      html.classList.remove('dark');
      if (icon) icon.setAttribute('data-lucide', 'moon');
    }
    this.initLucide();
  },

  toggleTheme() {
    const nextTheme = this.state.theme === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
  },

  // ==================== ACTIVE STUDY TIME TRACKER ====================
  initStudyTimerListeners() {
    const recordActivity = () => {
      this.state.studyTimer.lastActivityTime = Date.now();
      if (this.state.studyTimer.isPaused && this.state.studyTimer.active) {
        this.state.studyTimer.isPaused = false;
        const badge = document.getElementById('active-study-timer-badge');
        if (badge) badge.classList.remove('opacity-50');
      }
    };

    ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(evt => {
      window.addEventListener(evt, recordActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.state.studyTimer.isPaused = true;
        this.flushStudySession();
      } else {
        this.state.studyTimer.lastActivityTime = Date.now();
        this.state.studyTimer.isPaused = false;
      }
    });

    window.addEventListener('beforeunload', () => {
      this.flushStudySession();
    });
  },

  startStudyTimer(docId) {
    if (this.state.studyTimer.active && this.state.studyTimer.currentDocId === docId) {
      return;
    }

    this.stopStudyTimer();

    this.state.studyTimer.active = true;
    this.state.studyTimer.currentDocId = docId;
    this.state.studyTimer.elapsedSeconds = 0;
    this.state.studyTimer.unrecordedSeconds = 0;
    this.state.studyTimer.lastActivityTime = Date.now();
    this.state.studyTimer.isPaused = false;

    const badge = document.getElementById('active-study-timer-badge');
    if (badge) badge.classList.remove('hidden');

    this.state.studyTimer.intervalId = setInterval(() => {
      const idleTime = Date.now() - this.state.studyTimer.lastActivityTime;
      // Auto-pause if idle for > 60 seconds or tab blurred
      if (idleTime > 60000 || document.hidden) {
        this.state.studyTimer.isPaused = true;
        const b = document.getElementById('active-study-timer-badge');
        if (b) b.classList.add('opacity-50');
        return;
      }

      this.state.studyTimer.elapsedSeconds += 1;
      this.state.studyTimer.unrecordedSeconds += 1;
      this.updateStudyTimerDisplay();

      // Flush every 30 seconds
      if (this.state.studyTimer.unrecordedSeconds >= 30) {
        this.flushStudySession();
      }
    }, 1000);
  },

  stopStudyTimer() {
    this.flushStudySession();
    if (this.state.studyTimer.intervalId) {
      clearInterval(this.state.studyTimer.intervalId);
      this.state.studyTimer.intervalId = null;
    }
    this.state.studyTimer.active = false;
    this.state.studyTimer.currentDocId = null;
    const badge = document.getElementById('active-study-timer-badge');
    if (badge) badge.classList.add('hidden');
  },

  async flushStudySession() {
    const unrecorded = this.state.studyTimer.unrecordedSeconds;
    const docId = this.state.studyTimer.currentDocId;
    if (unrecorded >= 5 && docId) {
      this.state.studyTimer.unrecordedSeconds = 0;
      try {
        await API.recordStudySession(docId, unrecorded);
      } catch (e) {
        console.warn('Study session flush notice:', e);
      }
    }
  },

  updateStudyTimerDisplay() {
    const textEl = document.getElementById('active-study-timer-text');
    if (!textEl) return;
    const totalSecs = this.state.studyTimer.elapsedSeconds;
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins < 60) {
      textEl.innerText = `Active: ${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    } else {
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      textEl.innerText = `Active: ${hours}h ${remMins}m`;
    }
  },

  // ==================== ROUTING & NAVIGATION ====================
  async navigate(pageId, options = {}) {
    // If leaving presentation-learn, stop/flush study timer
    if (this.state.currentPage === 'presentation-learn' && pageId !== 'presentation-learn') {
      this.stopStudyTimer();
    }

    this.state.currentPage = pageId;

    // Update nav pills in header
    document.querySelectorAll('.nav-pill').forEach(el => {
      const target = el.getAttribute('data-nav-pill');
      if (target === pageId || (pageId === 'subject' && target === 'subjects')) {
        el.className = 'nav-pill px-4 py-1.5 rounded-full text-xs font-semibold transition text-white bg-blue-600 shadow-sm flex items-center space-x-1.5';
      } else {
        el.className = 'nav-pill px-4 py-1.5 rounded-full text-xs font-medium text-slate-300 hover:text-white transition flex items-center space-x-1.5';
      }
    });

    // Hide all pages, show target page
    document.querySelectorAll('.page-view').forEach(p => p.classList.add('hidden'));
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
      targetPage.classList.remove('hidden');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Page-specific loaders
    if (pageId === 'dashboard') {
      await this.loadDashboard();
    } else if (pageId === 'subject') {
      await this.loadSubject(options.subjectId);
    } else if (pageId === 'presentation-learn') {
      await this.loadPresentationLearning(options.docId);
    } else if (pageId === 'progress') {
      await this.loadLearningProgressPage();
    }

    this.initLucide();
  },

  // ==================== 1. MAIN DASHBOARD ====================
  async loadDashboard() {
    try {
      const subjects = await API.getSubjects();
      this.state.subjects = subjects || [];

      const countBadge = document.getElementById('subject-count-badge');
      if (countBadge) countBadge.innerText = `${this.state.subjects.length} Subjects`;

      const container = document.getElementById('subjects-container');
      const emptyState = document.getElementById('dashboard-empty-state');

      if (!this.state.subjects || this.state.subjects.length === 0) {
        if (container) container.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
      }

      if (emptyState) emptyState.classList.add('hidden');

      const gradients = [
        'from-blue-600 to-indigo-600',
        'from-cyan-600 to-blue-700',
        'from-violet-600 to-purple-800',
        'from-emerald-600 to-teal-700',
        'from-amber-600 to-orange-700',
        'from-rose-600 to-pink-700'
      ];

      if (container) {
        container.innerHTML = this.state.subjects.map((s, idx) => {
          const grad = gradients[idx % gradients.length];
          const desc = s.description || 'MBA curriculum and study presentation slides.';
          const count = s.document_count !== undefined ? s.document_count : (s.documents ? s.documents.length : 0);

          return `
            <div class="subject-card glass-panel p-6 rounded-3xl border border-white/10 flex flex-col justify-between group">
              <div>
                <div class="flex items-center justify-between mb-4">
                  <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr ${grad} text-white flex items-center justify-center font-bold text-lg shadow-md group-hover:scale-105 transition-transform">
                    <i data-lucide="book-open" class="w-6 h-6"></i>
                  </div>

                  <div class="flex items-center space-x-1">
                    <button 
                      onclick="App.openRenameSubjectModal('${s.id}', '${this.escapeHtml(s.name)}', '${this.escapeHtml(s.description || '')}')" 
                      class="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
                      title="Rename Subject"
                    >
                      <i data-lucide="edit-3" class="w-4 h-4"></i>
                    </button>
                    <button 
                      onclick="App.confirmDeleteSubject('${s.id}', '${this.escapeHtml(s.name)}')" 
                      class="p-2 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-white/5 transition"
                      title="Delete Subject"
                    >
                      <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                  </div>
                </div>

                <h3 class="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                  ${this.escapeHtml(s.name)}
                </h3>
                <p class="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                  ${this.escapeHtml(desc)}
                </p>
              </div>

              <div class="flex items-center justify-between pt-5 mt-4 border-t border-white/10">
                <span class="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                  <i data-lucide="presentation" class="w-3.5 h-3.5 text-cyan-400"></i>
                  <span>${count} ${count === 1 ? 'Presentation' : 'Presentations'}</span>
                </span>

                <button 
                  onclick="App.openSubject('${s.id}')"
                  class="px-4 py-2 rounded-xl bg-white/5 hover:bg-blue-600 text-slate-200 hover:text-white text-xs font-semibold transition border border-white/10 hover:border-transparent flex items-center space-x-1.5 shadow-sm"
                >
                  <span>Open Subject</span>
                  <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }

      this.initLucide();
    } catch (e) {
      console.error('Error loading dashboard:', e);
    }
  },

  // ==================== 2. DEDICATED SUBJECT PAGE ====================
  async openSubject(subjectId) {
    await this.navigate('subject', { subjectId });
  },

  async loadSubject(subjectId) {
    try {
      const data = await API.getSubjectDetail(subjectId);
      this.state.currentSubject = data;

      const titleEl = document.getElementById('subject-view-title');
      const countEl = document.getElementById('subject-view-count');
      const descEl = document.getElementById('subject-view-desc');

      if (titleEl) titleEl.innerText = data.name;
      if (descEl) descEl.innerText = data.description || 'MBA class presentations and interactive learning materials.';

      const docs = data.documents || [];
      if (countEl) countEl.innerText = `${docs.length} ${docs.length === 1 ? 'PPT' : 'PPTs'}`;

      const container = document.getElementById('subject-presentations-container');
      const emptyState = document.getElementById('subject-empty-state');

      if (!docs || docs.length === 0) {
        if (container) container.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
      }

      if (emptyState) emptyState.classList.add('hidden');

      if (container) {
        container.innerHTML = docs.map(doc => {
          const slideCount = doc.slide_count || 1;
          const uploadDate = doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently added';

          return `
            <div class="ppt-card glass-panel p-6 rounded-3xl border border-white/10 flex flex-col justify-between group">
              <div>
                <div class="flex items-center justify-between mb-3">
                  <span class="inline-flex items-center space-x-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>Ready to Learn</span>
                  </span>

                  <div class="flex items-center space-x-1">
                    <button 
                      onclick="App.openRenamePresentationModal('${doc.id}', '${this.escapeHtml(doc.name)}')" 
                      class="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
                      title="Rename Presentation"
                    >
                      <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                    </button>
                    <button 
                      onclick="App.confirmDeletePresentation('${doc.id}', '${this.escapeHtml(doc.name)}')" 
                      class="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-white/5 transition"
                      title="Delete Presentation"
                    >
                      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                  </div>
                </div>

                <h3 class="text-base font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-2">
                  ${this.escapeHtml(doc.name.replace(/\.pptx?$/i, ''))}
                </h3>
                <p class="text-[11px] text-slate-400 mt-1 truncate">
                  ${this.escapeHtml(doc.original_filename || doc.name)}
                </p>

                <div class="flex items-center space-x-3 mt-4 text-xs text-slate-400">
                  <span class="flex items-center space-x-1">
                    <i data-lucide="layers" class="w-3.5 h-3.5 text-cyan-400"></i>
                    <span>${slideCount} Slides</span>
                  </span>
                  <span>&bull;</span>
                  <span class="flex items-center space-x-1">
                    <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i>
                    <span>${uploadDate}</span>
                  </span>
                </div>
              </div>

              <div class="pt-5 mt-4 border-t border-white/10">
                <button 
                  onclick="App.openPresentationLearning('${doc.id}')"
                  class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition shadow-md shadow-blue-600/20 flex items-center justify-center space-x-1.5"
                >
                  <i data-lucide="play-circle" class="w-4 h-4"></i>
                  <span>Open & Learn</span>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }

      this.initLucide();
    } catch (e) {
      console.error('Error loading subject detail:', e);
    }
  },

  backToCurrentSubject() {
    if (this.state.currentSubject && this.state.currentSubject.id) {
      this.navigate('subject', { subjectId: this.state.currentSubject.id });
    } else {
      this.navigate('dashboard');
    }
  },

  // ==================== 3. PRESENTATION LEARNING WORKSPACE (6 TABS) ====================
  async openPresentationLearning(docId) {
    await this.navigate('presentation-learn', { docId });
  },

  async loadPresentationLearning(docId) {
    try {
      this.state.currentDocId = docId;

      // Start active study time tracking
      this.startStudyTimer(docId);

      // Fetch summary and session
      const summary = await API.getPresentationSummary(docId);
      const session = await API.getPresentationSession(docId);
      this.state.currentSummary = summary;
      this.state.currentSession = session;

      const overview = summary.overview || {};
      const titleEl = document.getElementById('learn-presentation-title');
      const subjectBadge = document.getElementById('learn-subject-badge');
      const slideCountText = document.getElementById('learn-slide-count-text');

      if (titleEl) titleEl.innerText = overview.title || 'Presentation Learning';
      if (subjectBadge) subjectBadge.innerText = overview.subject || (this.state.currentSubject ? this.state.currentSubject.name : 'MBA Curriculum');
      if (slideCountText) slideCountText.innerText = `${overview.total_slides || 1} Slides`;

      // Render Tab 1: Overview
      this.renderOverviewTab(overview, summary.concepts || []);

      // Render Tab 2: Detailed Summary
      this.renderDetailedSummaryTab(summary);

      // Render Tab 3: Learn with AI
      const concepts = summary.concepts || [];
      if (concepts.length > 0) {
        this.populateConceptDropdown(concepts);
        const activeConceptName = session.current_concept_name || concepts[0].name;
        await this.selectConceptByName(activeConceptName);
      }

      // Render Tab 4: Ask AI Chat History
      await this.loadPresentationChatHistory(docId);

      // Load Tab 5: Original PPT Slides data in background
      this.loadPresentationSlides(docId);

      // Load Tab 6: Quiz Catalog
      this.loadQuizCatalog(docId);

      // Default to Overview Tab
      this.switchLearnTab('overview');
      this.initLucide();
    } catch (e) {
      console.error('Error loading presentation workspace:', e);
    }
  },

  switchLearnTab(tabId) {
    // Update Tab Buttons
    document.querySelectorAll('.learn-tab-btn').forEach(btn => {
      btn.className = 'learn-tab-btn px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition flex items-center space-x-2 text-slate-400 hover:text-white hover:bg-white/5';
    });
    const activeBtn = document.getElementById(`tab-btn-${tabId}`);
    if (activeBtn) {
      activeBtn.className = 'learn-tab-btn px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center space-x-2 text-white bg-blue-600 shadow-sm';
    }

    // Hide all tabs, show selected tab
    document.querySelectorAll('.learn-tab-content').forEach(tab => tab.classList.add('hidden'));
    const target = document.getElementById(`learn-tab-${tabId}`);
    if (target) {
      target.classList.remove('hidden');
    }

    // Tab-specific initializations
    if (tabId === 'ppt-viewer') {
      this.renderCurrentSlide();
    }

    this.initLucide();
  },

  // --- TAB 1: OVERVIEW RENDERER ---
  renderOverviewTab(overview, concepts) {
    const objEl = document.getElementById('overview-objective');
    const structEl = document.getElementById('overview-structure');
    if (objEl) objEl.innerText = overview.central_objective || 'Master core business concepts and strategic execution.';
    if (structEl) structEl.innerText = overview.structure || '';

    const outcomesContainer = document.getElementById('overview-learn-outcomes');
    if (outcomesContainer) {
      const outcomes = overview.what_will_learn || [
        'Master foundational terminology and executive frameworks',
        'Analyze business trade-offs and capital allocation decisions',
        'Build defensible competitive moats in market execution'
      ];
      outcomesContainer.innerHTML = outcomes.map(o => `
        <div class="flex items-start space-x-2">
          <i data-lucide="check" class="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5"></i>
          <span>${this.escapeHtml(o)}</span>
        </div>
      `).join('');
    }

    const badgeCount = document.getElementById('overview-concepts-count');
    const badgesContainer = document.getElementById('overview-concepts-badges');
    if (badgeCount) badgeCount.innerText = `${concepts.length} Concepts Identified`;
    if (badgesContainer) {
      badgesContainer.innerHTML = concepts.map(c => `
        <button 
          onclick="App.jumpToConceptLearning('${this.escapeHtml(c.name)}')" 
          class="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-blue-600/30 border border-white/10 hover:border-blue-500/50 text-xs font-medium text-slate-200 transition flex items-center space-x-1.5"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
          <span>${this.escapeHtml(c.name)}</span>
          <span class="text-[10px] text-slate-400">Slide ${c.slide_numbers ? c.slide_numbers[0] : 1}</span>
        </button>
      `).join('');
    }
  },

  jumpToConceptLearning(conceptName) {
    this.switchLearnTab('tutor-teaching');
    this.selectConceptByName(conceptName);
  },

  // --- TAB 2: DETAILED SUMMARY RENDERER ---
  renderDetailedSummaryTab(summary) {
    const container = document.getElementById('detailed-summary-container');
    if (!container) return;

    const concepts = summary.concepts || [];
    const frameworks = summary.frameworks || [];
    const formulas = summary.formulas || [];
    const revision = summary.revision || {};

    let html = '';

    // Section 1: Concept Breakdown
    html += `
      <div class="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 space-y-6">
        <h3 class="text-base font-bold text-white uppercase tracking-wider flex items-center space-x-2">
          <i data-lucide="book-open" class="w-5 h-5 text-blue-400"></i>
          <span>1. Concept-by-Concept Breakdown</span>
        </h3>
        <div class="space-y-5 divide-y divide-white/10">
    `;

    concepts.forEach(c => {
      const firstSlide = c.slide_numbers && c.slide_numbers.length > 0 ? c.slide_numbers[0] : 1;
      const slides = c.slide_numbers ? c.slide_numbers.join(', ') : '1';
      html += `
        <div class="pt-5 first:pt-0 space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <h4 class="text-base font-bold text-white">${this.escapeHtml(c.name)}</h4>
            <button 
              onclick="App.jumpToSlideInViewer(${firstSlide})" 
              class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition flex items-center space-x-1"
              title="Click to view original slide"
            >
              <i data-lucide="monitor" class="w-3 h-3"></i>
              <span>Slide ${slides}</span>
            </button>
          </div>
          <p class="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium"><strong>Definition:</strong> ${this.escapeHtml(c.definition)}</p>
          <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">${this.escapeHtml(c.detailed_explanation)}</p>
          <div class="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-slate-300">
            <strong class="text-white">Real-World Case Study:</strong> ${this.escapeHtml(c.example)}
          </div>
        </div>
      `;
    });

    html += `</div></div>`;

    // Section 2: Frameworks
    if (frameworks.length > 0) {
      html += `
        <div class="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 space-y-5">
          <h3 class="text-base font-bold text-white uppercase tracking-wider flex items-center space-x-2">
            <i data-lucide="grid" class="w-5 h-5 text-purple-400"></i>
            <span>2. Strategic Frameworks & Decision Models</span>
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      `;
      frameworks.forEach(fw => {
        html += `
          <div class="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
            <h4 class="text-sm font-bold text-purple-300">${this.escapeHtml(fw.name)}</h4>
            <p class="text-xs text-slate-300"><strong>Why Used:</strong> ${this.escapeHtml(fw.why_used)}</p>
            <p class="text-xs text-slate-300"><strong>How It Works:</strong> ${this.escapeHtml(fw.how_works)}</p>
            <p class="text-xs text-slate-400"><strong>Example:</strong> ${this.escapeHtml(fw.step_by_step_example)}</p>
          </div>
        `;
      });
      html += `</div></div>`;
    }

    // Section 3: Revision Sheet
    html += `
      <div class="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 space-y-5">
        <h3 class="text-base font-bold text-white uppercase tracking-wider flex items-center space-x-2">
          <i data-lucide="award" class="w-5 h-5 text-amber-400"></i>
          <span>3. High-Yield Revision Sheet (Exam Prep)</span>
        </h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-3">
            <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Must-Know Key Takeaways</h4>
            <ul class="space-y-2 text-xs sm:text-sm text-slate-300">
              ${(revision.must_know_points || ['Master the core foundations', 'Prioritize high leverage opportunities']).map(pt => `
                <li class="flex items-start space-x-2">
                  <i data-lucide="check-circle" class="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5"></i>
                  <span>${this.escapeHtml(pt)}</span>
                </li>
              `).join('')}
            </ul>
          </div>

          <div class="space-y-3">
            <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Likely MBA Exam Questions</h4>
            <ul class="space-y-2 text-xs sm:text-sm text-slate-300">
              ${(revision.likely_exam_questions || ['Discuss the strategic implications of this framework.']).map(q => `
                <li class="flex items-start space-x-2">
                  <i data-lucide="help-circle" class="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"></i>
                  <span class="font-medium text-slate-200">${this.escapeHtml(q)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  exportPrintableSummary() {
    if (this.state.currentDocId) {
      window.open(`/api/presentations/${this.state.currentDocId}/export-printable`, '_blank');
    }
  },

  // --- TAB 3: LEARN WITH AI (STEP-BY-STEP TEACHING) ---
  populateConceptDropdown(concepts) {
    const dropdown = document.getElementById('concept-selector-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = concepts.map((c, idx) => `
      <option value="${this.escapeHtml(c.name)}">${idx + 1}. ${this.escapeHtml(c.name)}</option>
    `).join('');
  },

  async selectConceptByName(conceptName) {
    this.state.activeConceptName = conceptName;
    const dropdown = document.getElementById('concept-selector-dropdown');
    if (dropdown) dropdown.value = conceptName;
    await this.fetchAndRenderConceptPackage(conceptName, null);
  },

  async triggerTeachingControl(controlAction) {
    if (controlAction === 'prev_concept' || controlAction === 'next_concept') {
      const concepts = (this.state.currentSummary && this.state.currentSummary.concepts) || [];
      let idx = concepts.findIndex(c => c.name.toLowerCase() === this.state.activeConceptName.toLowerCase());
      if (idx === -1) idx = 0;

      if (controlAction === 'prev_concept') idx = Math.max(0, idx - 1);
      if (controlAction === 'next_concept') idx = Math.min(concepts.length - 1, idx + 1);

      const targetConcept = concepts[idx];
      if (targetConcept) {
        await this.selectConceptByName(targetConcept.name);
      }
      return;
    }

    await this.fetchAndRenderConceptPackage(this.state.activeConceptName, controlAction);
  },

  async fetchAndRenderConceptPackage(conceptName, controlAction) {
    try {
      const pkg = await API.teachPresentationConcept(this.state.currentDocId, conceptName, controlAction);
      
      this.state.currentSlideNumber = pkg.slide_number || 1;

      const titleDisplay = document.getElementById('concept-title-display');
      const controlBadge = document.getElementById('concept-control-badge');
      const slideBadge = document.getElementById('concept-slide-badge');
      const citationText = document.getElementById('concept-slide-citation-text');
      const counterIndicator = document.getElementById('concept-counter-indicator');

      if (titleDisplay) titleDisplay.innerText = pkg.concept_name;
      if (controlBadge) controlBadge.innerText = pkg.control_title || 'Standard Explanation';
      if (slideBadge) slideBadge.innerText = `Slide ${pkg.slide_number}`;
      if (citationText) citationText.innerText = `Source: Slide ${pkg.slide_number}`;
      if (counterIndicator) counterIndicator.innerText = `${(pkg.concept_index || 0) + 1} of ${pkg.total_concepts || 1}`;

      await API.updatePresentationSession(this.state.currentDocId, {
        current_concept_name: pkg.concept_name,
        current_slide_number: pkg.slide_number
      });

      const stepsContainer = document.getElementById('concept-steps-container');
      if (stepsContainer && pkg.steps) {
        const stepsToRender = pkg.steps.filter(s => s.step_number < 8);
        stepsContainer.innerHTML = stepsToRender.map(s => `
          <div class="space-y-1.5 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <h4 class="text-xs font-bold uppercase tracking-wider text-blue-400">
              Step ${s.step_number}: ${this.escapeHtml(s.title)}
            </h4>
            <div class="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
              ${this.escapeHtml(s.content)}
            </div>
          </div>
        `).join('');

        const step8 = pkg.steps.find(s => s.step_number === 8);
        if (step8) {
          this.renderComprehensionCheck(step8);
        }
      }

      const sourcesBox = document.getElementById('concept-sources-list');
      if (sourcesBox) {
        const ext = pkg.external_sources || [];
        if (ext.length > 0) {
          sourcesBox.innerHTML = ext.map(s => `
            <a 
              href="${s.url}" 
              target="_blank" 
              rel="noopener noreferrer"
              class="px-3 py-1.5 rounded-xl bg-cyan-900/30 hover:bg-cyan-800/40 border border-cyan-500/30 text-cyan-300 font-medium transition flex items-center space-x-1.5"
            >
              <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              <span class="truncate max-w-xs">${this.escapeHtml(s.title)}</span>
            </a>
          `).join('');
        } else {
          sourcesBox.innerHTML = `
            <a href="https://hbr.org" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-xl bg-cyan-900/30 text-cyan-300 text-xs">
              Harvard Business Review Case Studies
            </a>
          `;
        }
      }

      this.initLucide();
    } catch (e) {
      console.error('Error fetching concept teaching package:', e);
    }
  },

  renderComprehensionCheck(step8) {
    const qText = document.getElementById('comprehension-question-text');
    const optionsContainer = document.getElementById('comprehension-options-container');
    const feedbackBox = document.getElementById('comprehension-feedback');

    if (qText) qText.innerText = step8.question;
    if (feedbackBox) {
      feedbackBox.className = 'hidden text-xs p-3 rounded-xl';
      feedbackBox.innerText = '';
    }

    if (optionsContainer && step8.options) {
      optionsContainer.innerHTML = step8.options.map((opt, idx) => `
        <button 
          onclick="App.handleComprehensionAnswer(${idx}, ${step8.correct_index || 0}, '${this.escapeHtml(step8.explanation || '')}')"
          class="comprehension-option-btn w-full text-left px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/40 text-xs sm:text-sm text-slate-200 transition"
        >
          ${this.escapeHtml(opt.replace(/\(Correct\)/i, ''))}
        </button>
      `).join('');
    }
  },

  async handleComprehensionAnswer(selectedIdx, correctIdx, explanation) {
    const feedbackBox = document.getElementById('comprehension-feedback');
    const btns = document.querySelectorAll('.comprehension-option-btn');

    if (selectedIdx === correctIdx) {
      if (feedbackBox) {
        feedbackBox.className = 'text-xs p-3.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-start space-x-2';
        feedbackBox.innerHTML = `
          <i data-lucide="check-circle-2" class="w-4 h-4 flex-shrink-0 mt-0.5"></i>
          <div>
            <strong>Correct! Mastered this concept.</strong><br>
            ${this.escapeHtml(explanation)}
          </div>
        `;
      }
      btns[selectedIdx].classList.add('bg-emerald-600/30', 'border-emerald-500');

      if (this.state.currentDocId && this.state.activeConceptName) {
        await API.updatePresentationSession(this.state.currentDocId, {
          mark_understood: this.state.activeConceptName
        });
        await API.updateConceptStatus(this.state.currentDocId, this.state.activeConceptName, 'Understood');
      }
    } else {
      if (feedbackBox) {
        feedbackBox.className = 'text-xs p-3.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-start space-x-2';
        feedbackBox.innerHTML = `
          <i data-lucide="alert-circle" class="w-4 h-4 flex-shrink-0 mt-0.5"></i>
          <div>
            <strong>Not quite. Review the explanation above.</strong><br>
            ${this.escapeHtml(explanation)}
          </div>
        `;
      }
      btns[selectedIdx].classList.add('bg-rose-600/30', 'border-rose-500');
    }
    this.initLucide();
  },

  // --- TAB 4: ASK AI (DUAL KNOWLEDGE CHAT) ---
  async loadPresentationChatHistory(docId) {
    try {
      const data = await API.getPresentationChat(docId);
      this.state.chatMessages = data.messages || [];
      this.renderChatMessages();
    } catch (e) {
      console.warn('Error loading chat history:', e);
    }
  },

  renderChatMessages() {
    const container = document.getElementById('presentation-chat-history');
    if (!container) return;

    if (!this.state.chatMessages || this.state.chatMessages.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-slate-400 space-y-2">
          <i data-lucide="bot" class="w-10 h-10 mx-auto text-emerald-400/60"></i>
          <p class="text-sm font-semibold text-white">Ask your AI Tutor anything about this presentation</p>
          <p class="text-xs text-slate-400 max-w-sm mx-auto">Answers draw from your slide materials and verified external academic references (HBR, Investopedia, Wikipedia).</p>
        </div>
      `;
      this.initLucide();
      return;
    }

    container.innerHTML = this.state.chatMessages.map(m => {
      const isUser = m.role === 'user';
      if (isUser) {
        return `
          <div class="flex justify-end">
            <div class="max-w-xl bg-blue-600 text-white p-4 rounded-2xl rounded-tr-xs text-xs sm:text-sm shadow-md">
              ${this.escapeHtml(m.content)}
            </div>
          </div>
        `;
      } else {
        let formatted = m.content;
        if (window.marked) {
          try { formatted = window.marked.parse(m.content); } catch (e) {}
        }
        return `
          <div class="flex justify-start space-x-3">
            <div class="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold flex-shrink-0 mt-1">
              <i data-lucide="bot" class="w-4 h-4"></i>
            </div>
            <div class="max-w-2xl bg-white/[0.04] border border-white/10 p-5 rounded-3xl rounded-tl-xs text-xs sm:text-sm text-slate-200 prose-dark space-y-3 shadow-md">
              ${formatted}
            </div>
          </div>
        `;
      }
    }).join('');

    container.scrollTop = container.scrollHeight;
    this.initLucide();
  },

  async handlePresentationChatSubmit(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('presentation-chat-input');
    const query = input ? input.value.trim() : '';
    if (!query) return;

    input.value = '';

    this.state.chatMessages.push({ role: 'user', content: query });
    this.renderChatMessages();

    const thinking = document.getElementById('chat-thinking-indicator');
    if (thinking) thinking.classList.remove('hidden');

    try {
      const docId = this.state.currentDocId;
      const conceptName = this.state.activeConceptName || 'Core Strategy';
      const resp = await API.presentationTutorChat(docId, query, conceptName, this.state.currentSlideNumber || 1);

      if (resp && resp.reply) {
        this.state.chatMessages.push({ role: 'tutor', content: resp.reply, citation: resp.citation });
      }
    } catch (err) {
      this.state.chatMessages.push({ role: 'tutor', content: `Notice: ${err.message || 'Unable to retrieve answer.'}` });
    } finally {
      if (thinking) thinking.classList.add('hidden');
      this.renderChatMessages();
    }
  },

  async clearPresentationChatHistory() {
    if (!confirm('Clear conversation history for this presentation?')) return;
    if (this.state.currentDocId) {
      await API.clearPresentationChat(this.state.currentDocId);
      this.state.chatMessages = [];
      this.renderChatMessages();
    }
  },

  // ==================== TAB 5: ORIGINAL POWERPOINT VIEWER ====================
  async loadPresentationSlides(docId) {
    try {
      const data = await API.getPresentationSlides(docId);
      this.state.slidesData = {
        slides: data.slides || [],
        totalSlides: data.total_slides || 0,
        currentIndex: 0,
        zoomLevel: 1.0,
        downloadUrl: data.download_url || `/api/documents/${docId}/download`,
        loaded: true
      };

      // Set download link
      const dlLink = document.getElementById('ppt-download-link');
      if (dlLink) {
        dlLink.href = this.state.slidesData.downloadUrl;
      }

      this.renderSlideThumbnails();
      this.renderCurrentSlide();
    } catch (e) {
      console.warn('Error loading PPT slide layouts:', e);
    }
  },

  renderSlideThumbnails() {
    const container = document.getElementById('ppt-thumbnails-container');
    if (!container) return;

    const slides = this.state.slidesData.slides || [];
    if (slides.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-500 italic p-2">No slides available.</p>`;
      return;
    }

    container.innerHTML = slides.map((s, idx) => {
      const isSelected = idx === this.state.slidesData.currentIndex;
      const title = s.title || `Slide ${s.slide_number}`;
      return `
        <div 
          id="ppt-thumb-${idx}"
          onclick="App.jumpToSlideInViewer(${s.slide_number})"
          class="ppt-thumb-item p-2.5 rounded-xl cursor-pointer transition border text-left ${isSelected ? 'border-blue-500 bg-blue-600/20' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06]'}"
        >
          <div class="flex items-center justify-between text-[11px] font-bold text-slate-300">
            <span>Slide ${s.slide_number}</span>
            <span class="text-[10px] text-slate-500">${(s.shapes || []).length} elements</span>
          </div>
          <div class="text-xs text-slate-200 font-semibold truncate mt-1">${this.escapeHtml(title)}</div>
        </div>
      `;
    }).join('');
  },

  renderCurrentSlide() {
    const slides = this.state.slidesData.slides;
    if (!slides || slides.length === 0) return;

    const curIdx = this.state.slidesData.currentIndex;
    const slide = slides[curIdx];
    if (!slide) return;

    // Update Counter
    const counter = document.getElementById('ppt-viewer-counter');
    if (counter) counter.innerText = `Slide ${slide.slide_number} of ${this.state.slidesData.totalSlides}`;

    // Update Speaker Notes
    const notesNum = document.getElementById('ppt-notes-slide-num');
    const notesText = document.getElementById('ppt-speaker-notes-text');
    if (notesNum) notesNum.innerText = slide.slide_number;
    if (notesText) {
      notesText.innerText = slide.speaker_notes ? slide.speaker_notes : 'No speaker notes on this slide.';
    }

    // Update active thumbnail
    document.querySelectorAll('.ppt-thumb-item').forEach((el, idx) => {
      if (idx === curIdx) {
        el.className = 'ppt-thumb-item p-2.5 rounded-xl cursor-pointer transition border text-left border-blue-500 bg-blue-600/20 shadow-sm';
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        el.className = 'ppt-thumb-item p-2.5 rounded-xl cursor-pointer transition border text-left border-white/10 bg-white/[0.02] hover:bg-white/[0.06]';
      }
    });

    // Render Canvas Surface (16:9 ratio coordinate stage)
    const surface = document.getElementById('ppt-slide-canvas-surface');
    if (!surface) return;

    // Apply Zoom Transform
    surface.style.transform = `scale(${this.state.slidesData.zoomLevel})`;

    const shapes = slide.shapes || [];

    if (shapes.length === 0) {
      // Fallback clean text card
      surface.innerHTML = `
        <div class="w-full h-full flex flex-col justify-center items-center p-12 text-center bg-gradient-to-br from-[#0c1322] to-[#162238] text-white">
          <span class="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3">Slide ${slide.slide_number}</span>
          <h2 class="text-2xl font-bold mb-4">${this.escapeHtml(slide.title || 'Slide Content')}</h2>
          <div class="text-sm text-slate-300 max-w-xl whitespace-pre-line leading-relaxed">
            ${this.escapeHtml((slide.paragraphs || []).join('\n\n'))}
          </div>
        </div>
      `;
      return;
    }

    // Build shapes layout
    let shapesHtml = '';
    shapes.forEach(shape => {
      const left = shape.left_pct !== undefined ? shape.left_pct : 5;
      const top = shape.top_pct !== undefined ? shape.top_pct : 5;
      const width = shape.width_pct !== undefined ? shape.width_pct : 90;
      const height = shape.height_pct !== undefined ? shape.height_pct : 20;

      const style = `position: absolute; left: ${left}%; top: ${top}%; width: ${width}%; min-height: ${Math.max(4, height)}%; box-sizing: border-box;`;

      if (shape.type === 'title') {
        shapesHtml += `
          <div style="${style}" class="ppt-shape-title p-3 text-left">
            <h2 class="text-lg sm:text-2xl font-extrabold text-white tracking-tight leading-snug drop-shadow-sm">
              ${this.escapeHtml(shape.text)}
            </h2>
          </div>
        `;
      } else if (shape.type === 'table') {
        const rows = shape.rows || [];
        let tableRows = rows.map((r, rIdx) => {
          const isHeader = rIdx === 0;
          const cells = (r.cells || []).map(c => {
            const cellTag = isHeader ? 'th' : 'td';
            const cellClass = isHeader ? 'bg-blue-600/30 text-white font-bold p-2 text-xs border border-white/15' : 'p-2 text-xs text-slate-200 border border-white/10';
            return `<${cellTag} class="${cellClass}">${this.escapeHtml(c)}</${cellTag}>`;
          }).join('');
          return `<tr>${cells}</tr>`;
        }).join('');

        shapesHtml += `
          <div style="${style}" class="ppt-shape-table p-2 overflow-auto">
            <table class="w-full border-collapse rounded-lg overflow-hidden bg-black/40">
              ${tableRows}
            </table>
          </div>
        `;
      } else if (shape.type === 'picture') {
        shapesHtml += `
          <div style="${style}" class="ppt-shape-picture p-1 flex items-center justify-center">
            <img 
              src="${shape.asset_url || '#'}" 
              alt="${this.escapeHtml(shape.name || 'Slide image')}" 
              class="max-w-full max-h-full object-contain rounded-lg border border-white/10 shadow-md"
              onerror="this.style.display='none'"
            />
          </div>
        `;
      } else {
        // Body / Text Box
        const paras = shape.paragraphs || (shape.text ? [shape.text] : []);
        const paraHtml = paras.map(p => {
          const isBullet = p.trim().startsWith('•') || p.trim().startsWith('-');
          return `<p class="text-xs sm:text-sm text-slate-200 leading-relaxed ${isBullet ? 'pl-2' : ''}">${this.escapeHtml(p)}</p>`;
        }).join('');

        shapesHtml += `
          <div style="${style}" class="ppt-shape-textbox p-3 overflow-hidden text-left space-y-2">
            ${paraHtml}
          </div>
        `;
      }
    });

    surface.innerHTML = shapesHtml;
  },

  prevSlide() {
    if (this.state.slidesData.currentIndex > 0) {
      this.state.slidesData.currentIndex -= 1;
      this.renderCurrentSlide();
    }
  },

  nextSlide() {
    if (this.state.slidesData.currentIndex < (this.state.slidesData.slides.length - 1)) {
      this.state.slidesData.currentIndex += 1;
      this.renderCurrentSlide();
    }
  },

  jumpToSlideInViewer(slideNum) {
    this.switchLearnTab('ppt-viewer');
    const targetIdx = Math.max(0, Math.min(this.state.slidesData.slides.length - 1, slideNum - 1));
    this.state.slidesData.currentIndex = targetIdx;
    this.renderCurrentSlide();
  },

  zoomSlide(delta) {
    let newZoom = this.state.slidesData.zoomLevel + delta;
    newZoom = Math.max(0.5, Math.min(2.0, parseFloat(newZoom.toFixed(1))));
    this.state.slidesData.zoomLevel = newZoom;

    const display = document.getElementById('ppt-zoom-display');
    if (display) display.innerText = `${Math.round(newZoom * 100)}%`;

    const surface = document.getElementById('ppt-slide-canvas-surface');
    if (surface) surface.style.transform = `scale(${newZoom})`;
  },

  resetZoomSlide() {
    this.state.slidesData.zoomLevel = 1.0;
    const display = document.getElementById('ppt-zoom-display');
    if (display) display.innerText = '100%';

    const surface = document.getElementById('ppt-slide-canvas-surface');
    if (surface) surface.style.transform = 'scale(1.0)';
  },

  toggleViewerFullscreen() {
    const stage = document.getElementById('ppt-viewer-stage');
    if (!stage) return;
    if (!document.fullscreenElement) {
      stage.requestFullscreen().catch(err => console.warn('Fullscreen err:', err));
    } else {
      document.exitFullscreen().catch(err => console.warn('Exit fullscreen err:', err));
    }
  },

  // ==================== TAB 6: CONCEPT-BY-CONCEPT QUIZZES (EXACTLY 5 QUESTIONS) ====================
  async loadQuizCatalog(docId) {
    try {
      const data = await API.getQuizCatalog(docId);
      const catalog = data.catalog || [];
      this.state.quizState.catalog = catalog;

      const select = document.getElementById('quiz-concept-select');
      if (select && catalog.length > 0) {
        select.innerHTML = catalog.map((item, idx) => {
          const statusText = item.status !== 'Not Started' ? ` (${item.status} - ${item.best_score || 0}%)` : '';
          return `<option value="${this.escapeHtml(item.concept_name)}">${idx + 1}. ${this.escapeHtml(item.concept_name)}${statusText}</option>`;
        }).join('');

        const firstConcept = catalog[0].concept_name;
        this.state.quizState.currentConcept = firstConcept;
        await this.openQuizPrepForCurrentConcept();
      }
    } catch (e) {
      console.warn('Error loading quiz catalog:', e);
    }
  },

  async handleQuizConceptChange(conceptName) {
    this.state.quizState.currentConcept = conceptName;
    await this.openQuizPrepForCurrentConcept();
  },

  async openQuizPrepForCurrentConcept() {
    const conceptName = this.state.quizState.currentConcept;
    if (!conceptName || !this.state.currentDocId) return;

    // Show Prep View, hide Player and Results
    document.getElementById('quiz-state-prep')?.classList.remove('hidden');
    document.getElementById('quiz-state-player')?.classList.add('hidden');
    document.getElementById('quiz-state-results')?.classList.add('hidden');

    try {
      const prep = await API.getQuizPrep(this.state.currentDocId, conceptName);
      this.state.quizState.prepData = prep;

      const titleEl = document.getElementById('quiz-prep-concept-title');
      const badgeEl = document.getElementById('quiz-prep-slides-badge');
      const coversEl = document.getElementById('quiz-prep-covers-text');
      const pointsList = document.getElementById('quiz-prep-five-points');
      const frameworkEl = document.getElementById('quiz-prep-framework-text');

      if (titleEl) titleEl.innerText = prep.concept_name;
      if (badgeEl) badgeEl.innerText = `Slides ${prep.slide_numbers ? prep.slide_numbers.join(', ') : '1'}`;
      if (coversEl) coversEl.innerText = prep.what_it_covers;
      if (frameworkEl) frameworkEl.innerText = prep.decision_framework;

      if (pointsList && prep.key_revision_points) {
        pointsList.innerHTML = prep.key_revision_points.map((pt, i) => `
          <li class="flex items-start space-x-2">
            <span class="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">${i + 1}</span>
            <span>${this.escapeHtml(pt)}</span>
          </li>
        `).join('');
      }

      this.initLucide();
    } catch (e) {
      console.warn('Error loading quiz prep:', e);
    }
  },

  async startFiveQuestionQuiz(skipPrep = false) {
    const conceptName = this.state.quizState.currentConcept;
    const docId = this.state.currentDocId;
    if (!conceptName || !docId) return;

    const diffSelect = document.getElementById('quiz-difficulty-select');
    const difficulty = diffSelect ? diffSelect.value : 'Medium';

    // Show Player, hide Prep and Results
    document.getElementById('quiz-state-prep')?.classList.add('hidden');
    document.getElementById('quiz-state-player')?.classList.remove('hidden');
    document.getElementById('quiz-state-results')?.classList.add('hidden');

    try {
      const quiz = await API.generateConceptQuiz(docId, conceptName, difficulty);
      this.state.quizState.activeQuiz = quiz;
      this.state.quizState.currentQuestionIndex = 0;
      this.state.quizState.userAnswers = {};
      this.state.quizState.elapsedSeconds = 0;
      this.state.quizState.startTime = Date.now();

      // Start quiz live timer
      if (this.state.quizState.timerInterval) {
        clearInterval(this.state.quizState.timerInterval);
      }
      this.state.quizState.timerInterval = setInterval(() => {
        this.state.quizState.elapsedSeconds += 1;
        const total = this.state.quizState.elapsedSeconds;
        const mins = Math.floor(total / 60);
        const secs = total % 60;
        const timerEl = document.getElementById('quiz-player-timer');
        if (timerEl) {
          timerEl.innerText = `Time: ${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }
      }, 1000);

      this.renderQuizQuestion(0);
    } catch (e) {
      alert(`Quiz notice: ${e.message || 'Unable to generate quiz questions'}`);
    }
  },

  renderQuizQuestion(index) {
    const quiz = this.state.quizState.activeQuiz;
    if (!quiz || !quiz.questions || quiz.questions.length === 0) return;

    this.state.quizState.currentQuestionIndex = index;
    const q = quiz.questions[index];
    const totalQ = quiz.questions.length; // strictly 5

    // Update Counter & Progress Bar
    const counter = document.getElementById('quiz-player-counter');
    const progBar = document.getElementById('quiz-player-progress-bar');
    const typeBadge = document.getElementById('quiz-player-type-badge');
    const qText = document.getElementById('quiz-player-question-text');
    const qHint = document.getElementById('quiz-player-question-hint');

    if (counter) counter.innerText = `Question ${index + 1} of ${totalQ}`;
    if (progBar) progBar.style.width = `${((index + 1) / totalQ) * 100}%`;
    if (typeBadge) typeBadge.innerText = `${q.question_type || 'Single Choice'} • ${q.difficulty || 'Medium'}`;
    if (qText) qText.innerText = q.stem;
    if (qHint) {
      qHint.innerText = q.question_type === 'Multiple Select' ? 'Select all options that apply.' : 'Choose the best single answer.';
    }

    // Render Options
    const container = document.getElementById('quiz-player-options-container');
    if (container) {
      const selected = this.state.quizState.userAnswers[q.id] || [];
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

      container.innerHTML = (q.options || []).map((opt, optIdx) => {
        const isSelected = selected.includes(optIdx);
        const letter = letters[optIdx] || (optIdx + 1);
        return `
          <div 
            onclick="App.selectQuizOption(${optIdx})"
            class="quiz-option-card p-4 rounded-2xl cursor-pointer transition border flex items-center space-x-3.5 ${isSelected ? 'selected' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.08]'}"
          >
            <div class="option-letter w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${isSelected ? 'bg-blue-600 text-white' : 'bg-white/10 text-slate-300'}">
              ${letter}
            </div>
            <div class="text-xs sm:text-sm text-slate-100 font-medium flex-1">
              ${this.escapeHtml(opt)}
            </div>
          </div>
        `;
      }).join('');
    }

    // Update Prev / Next / Submit buttons
    const btnPrev = document.getElementById('quiz-btn-prev');
    const btnNext = document.getElementById('quiz-btn-next');
    const btnSubmit = document.getElementById('quiz-btn-submit');

    if (btnPrev) {
      btnPrev.disabled = index === 0;
      btnPrev.style.opacity = index === 0 ? '0.4' : '1.0';
    }

    if (index === totalQ - 1) {
      if (btnNext) btnNext.classList.add('hidden');
      if (btnSubmit) btnSubmit.classList.remove('hidden');
    } else {
      if (btnNext) btnNext.classList.remove('hidden');
      if (btnSubmit) btnSubmit.classList.add('hidden');
    }

    this.initLucide();
  },

  selectQuizOption(optIndex) {
    const quiz = this.state.quizState.activeQuiz;
    if (!quiz) return;
    const curIdx = this.state.quizState.currentQuestionIndex;
    const q = quiz.questions[curIdx];
    if (!q) return;

    const currentSelected = this.state.quizState.userAnswers[q.id] || [];

    if (q.question_type === 'Multiple Select') {
      if (currentSelected.includes(optIndex)) {
        this.state.quizState.userAnswers[q.id] = currentSelected.filter(i => i !== optIndex);
      } else {
        this.state.quizState.userAnswers[q.id] = [...currentSelected, optIndex];
      }
    } else {
      this.state.quizState.userAnswers[q.id] = [optIndex];
    }

    this.renderQuizQuestion(curIdx);
  },

  prevQuizQuestion() {
    if (this.state.quizState.currentQuestionIndex > 0) {
      this.renderQuizQuestion(this.state.quizState.currentQuestionIndex - 1);
    }
  },

  nextQuizQuestion() {
    const totalQ = this.state.quizState.activeQuiz?.questions?.length || 5;
    if (this.state.quizState.currentQuestionIndex < totalQ - 1) {
      this.renderQuizQuestion(this.state.quizState.currentQuestionIndex + 1);
    }
  },

  async submitQuizAnswers() {
    const quiz = this.state.quizState.activeQuiz;
    if (!quiz || this.state.quizState.isSubmitting) return;

    // Check unanswered questions
    const unanswered = quiz.questions.filter(q => {
      const sel = this.state.quizState.userAnswers[q.id];
      return !sel || sel.length === 0;
    });

    if (unanswered.length > 0) {
      if (!confirm(`You have ${unanswered.length} unanswered questions. Submit quiz anyway?`)) {
        return;
      }
    }

    // Stop timer
    if (this.state.quizState.timerInterval) {
      clearInterval(this.state.quizState.timerInterval);
      this.state.quizState.timerInterval = null;
    }

    this.state.quizState.isSubmitting = true;

    try {
      const formattedAnswers = quiz.questions.map(q => ({
        question_id: q.id,
        selected_indices: this.state.quizState.userAnswers[q.id] || [],
        time_spent_seconds: Math.round(this.state.quizState.elapsedSeconds / quiz.questions.length)
      }));

      const result = await API.submitQuiz(quiz.quiz_id, formattedAnswers);
      this.state.quizState.lastResult = result;

      // Show Results View
      document.getElementById('quiz-state-player')?.classList.add('hidden');
      document.getElementById('quiz-state-results')?.classList.remove('hidden');

      this.renderQuizResults(result);

      // Trigger Confetti if passed (>= 60%)
      if (result.percentage >= 60) {
        this.launchConfettiAnimation();
      }

      // Refresh quiz catalog to update status badges
      await this.loadQuizCatalog(this.state.currentDocId);
    } catch (e) {
      alert(`Submission notice: ${e.message || 'Failed to submit quiz answers'}`);
    } finally {
      this.state.quizState.isSubmitting = false;
    }
  },

  renderQuizResults(result) {
    const headline = document.getElementById('quiz-results-headline');
    const conceptNameEl = document.getElementById('quiz-results-concept-name');
    const scoreEl = document.getElementById('quiz-results-score');
    const accuracyEl = document.getElementById('quiz-results-accuracy');
    const timeEl = document.getElementById('quiz-results-time');
    const statusEl = document.getElementById('quiz-results-status');
    const strongEl = document.getElementById('quiz-results-strong-text');
    const revisionEl = document.getElementById('quiz-results-revision-text');
    const breakdownContainer = document.getElementById('quiz-results-breakdown-container');

    if (conceptNameEl) conceptNameEl.innerText = result.concept_name;
    if (scoreEl) scoreEl.innerText = `${result.score} / ${result.total_questions}`;
    if (accuracyEl) accuracyEl.innerText = `${result.percentage}%`;

    const mins = Math.floor(result.time_taken_seconds / 60);
    const secs = result.time_taken_seconds % 60;
    if (timeEl) timeEl.innerText = `${mins}m ${secs}s`;

    if (statusEl) {
      statusEl.innerText = result.concept_status;
      statusEl.className = result.concept_status === 'Understood' ? 'text-base font-extrabold text-emerald-400 mt-2' : 'text-base font-extrabold text-amber-400 mt-2';
    }

    if (headline) {
      headline.innerText = result.percentage >= 80 ? 'Mastery Achieved! Concept Understood!' : (result.percentage >= 60 ? 'Good Effort! Keep Practicing!' : 'Needs Revision! Review Concept Slides!');
    }

    if (strongEl) {
      strongEl.innerText = (result.strong_areas && result.strong_areas.length > 0) ? result.strong_areas.join(', ') : 'Solid grasp of fundamental definitions and terminology.';
    }

    if (revisionEl) {
      revisionEl.innerText = (result.weak_areas && result.weak_areas.length > 0) ? result.weak_areas.join(', ') : 'None! You demonstrated excellent concept command.';
    }

    // Breakdown questions
    if (breakdownContainer && result.question_results) {
      const letters = ['A', 'B', 'C', 'D', 'E'];
      breakdownContainer.innerHTML = result.question_results.map((qr, idx) => {
        const isCorrect = qr.is_correct;
        const cardBorder = isCorrect ? 'border-emerald-500/30 bg-emerald-950/10' : 'border-rose-500/30 bg-rose-950/10';
        const badgeClass = isCorrect ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30';
        const badgeText = isCorrect ? '✓ Correct' : '✗ Incorrect';

        const userAnswersText = (qr.user_selected_indices || []).map(i => `${letters[i]}. ${qr.options[i]}`).join(', ') || 'No answer selected';
        const correctAnswersText = (qr.correct_indices || []).map(i => `${letters[i]}. ${qr.options[i]}`).join(', ');

        return `
          <div class="p-5 rounded-2xl border ${cardBorder} space-y-3">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <span class="text-xs font-bold text-white">Question ${idx + 1}: ${this.escapeHtml(qr.stem)}</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeClass}">${badgeText}</span>
            </div>

            <div class="text-xs space-y-1">
              <p class="text-slate-300"><strong>Your Answer:</strong> <span class="${isCorrect ? 'text-emerald-300 font-semibold' : 'text-rose-300 font-semibold'}">${this.escapeHtml(userAnswersText)}</span></p>
              ${!isCorrect ? `<p class="text-slate-300"><strong>Correct Answer:</strong> <span class="text-emerald-300 font-semibold">${this.escapeHtml(correctAnswersText)}</span></p>` : ''}
            </div>

            <div class="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-slate-300 space-y-1">
              <p><strong>Explanation:</strong> ${this.escapeHtml(qr.explanation)}</p>
              <div class="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                <button 
                  onclick="App.jumpToSlideInViewer(${qr.slide_number || 1})" 
                  class="text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                >
                  <i data-lucide="monitor" class="w-3 h-3"></i>
                  <span>Source: Slide ${qr.slide_number || 1}</span>
                </button>
                <span>${this.escapeHtml(qr.question_type || 'Single Choice')}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    this.initLucide();
  },

  retryQuizCurrent(skipPrep = false) {
    this.startFiveQuestionQuiz(skipPrep);
  },

  async regenerateQuizFiveNew() {
    const activeQuiz = this.state.quizState.activeQuiz;
    if (!activeQuiz) return;
    try {
      const regenerated = await API.regenerateQuiz(activeQuiz.quiz_id);
      this.state.quizState.activeQuiz = regenerated;
      this.state.quizState.currentQuestionIndex = 0;
      this.state.quizState.userAnswers = {};
      this.state.quizState.elapsedSeconds = 0;
      this.state.quizState.startTime = Date.now();

      // Show player
      document.getElementById('quiz-state-prep')?.classList.add('hidden');
      document.getElementById('quiz-state-results')?.classList.add('hidden');
      document.getElementById('quiz-state-player')?.classList.remove('hidden');

      this.renderQuizQuestion(0);
    } catch (e) {
      alert(`Notice: ${e.message || 'Failed to regenerate questions'}`);
    }
  },

  async advanceToNextConceptQuiz() {
    const catalog = this.state.quizState.catalog;
    if (!catalog || catalog.length === 0) return;

    const curConcept = this.state.quizState.currentConcept;
    const curIdx = catalog.findIndex(c => c.concept_name === curConcept);
    const nextIdx = (curIdx + 1) % catalog.length;
    const nextConcept = catalog[nextIdx].concept_name;

    const select = document.getElementById('quiz-concept-select');
    if (select) select.value = nextConcept;

    await this.handleQuizConceptChange(nextConcept);
  },

  launchConfettiAnimation() {
    const canvas = document.getElementById('quiz-confetti-canvas');
    if (!canvas) return;

    // Check reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.offsetWidth || window.innerWidth;
    canvas.height = canvas.parentElement.offsetHeight || 500;
    canvas.style.display = 'block';

    const particles = [];
    const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#06B6D4', '#EC4899'];

    for (let i = 0; i < 70; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 3,
        r: Math.random() * 5 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.7) * 14,
        alpha: 1,
        life: Math.random() * 60 + 60
      });
    }

    let frame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      particles.forEach(p => {
        if (p.alpha > 0.02) {
          alive = true;
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.35; // gravity
          p.vx *= 0.98; // drag
          p.alpha -= 0.015;

          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });

      frame++;
      if (alive && frame < 180) {
        requestAnimationFrame(animate);
      } else {
        canvas.style.display = 'none';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    requestAnimationFrame(animate);
  },

  // ==================== PAGE 4: MY LEARNING PROGRESS ====================
  async loadLearningProgressPage() {
    try {
      const data = await API.getLearningAnalytics();
      this.state.learningAnalytics = data;

      // 1. Render 8 Metrics
      const m = data.metrics || {};
      const elSubjects = document.getElementById('stat-total-subjects');
      const elPpts = document.getElementById('stat-total-ppts');
      const elStudied = document.getElementById('stat-ppts-studied');
      const elCompleted = document.getElementById('stat-concepts-completed');
      const elRemaining = document.getElementById('stat-concepts-remaining');
      const elQuizzes = document.getElementById('stat-quizzes-count');
      const elAccuracy = document.getElementById('stat-quiz-accuracy');
      const elStudyTime = document.getElementById('stat-study-time');

      if (elSubjects) elSubjects.innerText = m.total_subjects || 0;
      if (elPpts) elPpts.innerText = m.total_presentations || 0;
      if (elStudied) elStudied.innerText = m.presentations_studied || 0;
      if (elCompleted) elCompleted.innerText = m.concepts_completed || 0;
      if (elRemaining) elRemaining.innerText = m.concepts_remaining || 0;
      if (elQuizzes) elQuizzes.innerText = m.quizzes_taken || 0;
      if (elAccuracy) elAccuracy.innerText = `${m.avg_quiz_accuracy || 0}%`;

      const totalMins = m.total_study_minutes || 0;
      if (elStudyTime) {
        if (totalMins < 60) {
          elStudyTime.innerText = `${totalMins}m`;
        } else {
          const h = Math.floor(totalMins / 60);
          const rem = totalMins % 60;
          elStudyTime.innerText = `${h}h ${rem}m`;
        }
      }

      // 2. Render What Should I Study Next?
      this.renderProgressRecommendations(data.recommendations || []);

      // 3. Render 7-Day Activity Chart
      this.renderStudyChart(data.daily_chart || []);

      // 4. Render Subject-Wise Mastery
      this.renderSubjectProgressCards(data.subject_progress || []);

      // 5. Render Presentation Learning Tracker
      this.renderPresentationProgressList(data.presentation_progress || []);

      this.initLucide();
    } catch (e) {
      console.error('Error loading learning analytics:', e);
    }
  },

  renderProgressRecommendations(recs) {
    const container = document.getElementById('progress-recommendations-list');
    if (!container) return;

    if (!recs || recs.length === 0) {
      container.innerHTML = `
        <div class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center space-x-2">
          <i data-lucide="check-circle" class="w-4 h-4"></i>
          <span>All caught up! You have mastered all tested concepts across your presentations.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = recs.map(rec => {
      const isUrgent = rec.reason.toLowerCase().includes('quiz') || rec.reason.toLowerCase().includes('revision');
      const badgeClass = isUrgent ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30';

      return `
        <div class="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="space-y-1">
            <div class="flex items-center space-x-2">
              <h4 class="text-sm font-bold text-white">${this.escapeHtml(rec.concept_name)}</h4>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeClass}">${this.escapeHtml(rec.reason)}</span>
            </div>
            <p class="text-xs text-slate-400">Presentation: <strong class="text-slate-200">${this.escapeHtml(rec.doc_title)}</strong></p>
          </div>

          <button 
            onclick="App.openPresentationLearning('${rec.doc_id}')"
            class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition flex items-center space-x-1.5 flex-shrink-0"
          >
            <span>Resume Study</span>
            <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `;
    }).join('');
  },

  renderStudyChart(dailyChart) {
    const container = document.getElementById('study-chart-bars');
    if (!container) return;

    if (!dailyChart || dailyChart.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-500 italic">No study activity recorded yet.</p>`;
      return;
    }

    const maxMinutes = Math.max(...dailyChart.map(d => d.minutes), 30);

    container.innerHTML = dailyChart.map(d => {
      const heightPct = Math.max(8, Math.round((d.minutes / maxMinutes) * 100));
      return `
        <div class="flex-1 flex flex-col items-center justify-end h-full group">
          <div class="text-[10px] font-semibold text-slate-400 group-hover:text-cyan-400 transition mb-1.5">${d.minutes}m</div>
          <div class="w-full max-w-[42px] bg-gradient-to-t from-blue-600 to-cyan-400 rounded-t-lg transition-all duration-500 shadow-md group-hover:from-blue-500 group-hover:to-cyan-300" style="height: ${heightPct}%"></div>
          <span class="text-[11px] font-bold text-slate-400 mt-2">${d.day_name}</span>
        </div>
      `;
    }).join('');
  },

  renderSubjectProgressCards(subjects) {
    const container = document.getElementById('progress-subjects-grid');
    if (!container) return;

    if (!subjects || subjects.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-500 italic p-4">No subjects created yet.</p>`;
      return;
    }

    container.innerHTML = subjects.map(s => {
      const pct = s.completion_percentage || 0;
      return `
        <div class="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="text-base font-bold text-white">${this.escapeHtml(s.name)}</h4>
            <span class="text-xs font-extrabold text-blue-400">${pct}%</span>
          </div>

          <div class="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div class="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
          </div>

          <div class="grid grid-cols-3 gap-2 text-center pt-2 border-t border-white/10 text-xs">
            <div>
              <span class="text-[10px] text-slate-400 uppercase font-bold block">PPTs</span>
              <span class="font-extrabold text-white">${s.total_documents || 0}</span>
            </div>
            <div>
              <span class="text-[10px] text-slate-400 uppercase font-bold block">Mastered</span>
              <span class="font-extrabold text-emerald-400">${s.mastered_concepts || 0}</span>
            </div>
            <div>
              <span class="text-[10px] text-slate-400 uppercase font-bold block">Quizzes</span>
              <span class="font-extrabold text-purple-400">${s.quizzes_taken || 0}</span>
            </div>
          </div>

          <button 
            onclick="App.openSubject('${s.id}')"
            class="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold border border-white/10 transition flex items-center justify-center space-x-1"
          >
            <span>View Subject</span>
            <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `;
    }).join('');
  },

  renderPresentationProgressList(docs) {
    const container = document.getElementById('progress-presentations-container');
    if (!container) return;

    if (!docs || docs.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-500 italic p-4">No presentations uploaded yet.</p>`;
      return;
    }

    container.innerHTML = docs.map(doc => {
      const pct = doc.completion_percentage || 0;
      const statusBadge = pct >= 80 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : (pct > 0 ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30');
      const statusText = pct >= 80 ? 'Mastered' : (pct > 0 ? 'In Progress' : 'Not Started');

      return `
        <div class="glass-panel p-5 rounded-2xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-1.5 flex-1">
            <div class="flex items-center space-x-2.5">
              <h4 class="text-sm font-bold text-white">${this.escapeHtml(doc.name.replace(/\.pptx?$/i, ''))}</h4>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadge}">${statusText}</span>
            </div>
            <p class="text-xs text-slate-400">Subject: <strong class="text-slate-300">${this.escapeHtml(doc.subject_name)}</strong> • ${doc.slide_count || 1} Slides • ${doc.quizzes_taken || 0} Quizzes</p>
          </div>

          <div class="flex items-center space-x-4 flex-shrink-0">
            <div class="w-28 text-right hidden sm:block">
              <span class="text-xs font-bold text-white">${pct}% Complete</span>
              <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-1">
                <div class="h-full bg-blue-500 rounded-full" style="width: ${pct}%"></div>
              </div>
            </div>

            <button 
              onclick="App.openPresentationLearning('${doc.id}')"
              class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition flex items-center space-x-1.5"
            >
              <span>Resume Learning</span>
              <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  // ==================== 4. SUBJECT CRUD MODALS ====================
  openCreateSubjectModal() {
    const nameInput = document.getElementById('modal-subject-name-input');
    const descInput = document.getElementById('modal-subject-desc-input');
    const err = document.getElementById('modal-subject-error');
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    if (err) {
      err.innerText = '';
      err.classList.add('hidden');
    }
    document.getElementById('modal-create-subject')?.classList.remove('hidden');
    nameInput?.focus();
  },

  async submitCreateSubject() {
    const nameInput = document.getElementById('modal-subject-name-input');
    const descInput = document.getElementById('modal-subject-desc-input');
    const err = document.getElementById('modal-subject-error');

    const name = nameInput ? nameInput.value.trim() : '';
    const desc = descInput ? descInput.value.trim() : '';

    if (!name) {
      if (err) {
        err.innerText = 'Please enter a subject name.';
        err.classList.remove('hidden');
      }
      return;
    }

    try {
      await API.createSubject({ name, description: desc, semester: 'MBA Core' });
      this.closeModals();
      await this.loadDashboard();
    } catch (e) {
      if (err) {
        err.innerText = e.message || 'Subject already exists or could not be created.';
        err.classList.remove('hidden');
      }
    }
  },

  openRenameSubjectModal(id, currentName, currentDesc) {
    document.getElementById('modal-rename-subject-id').value = id;
    const nameEl = document.getElementById('modal-rename-subject-input');
    const descEl = document.getElementById('modal-rename-subject-desc-input');
    if (nameEl) nameEl.value = currentName;
    if (descEl) descEl.value = currentDesc;
    document.getElementById('modal-rename-subject')?.classList.remove('hidden');
    nameEl?.focus();
  },

  async submitRenameSubject() {
    const id = document.getElementById('modal-rename-subject-id').value;
    const name = document.getElementById('modal-rename-subject-input').value.trim();
    const desc = document.getElementById('modal-rename-subject-desc-input').value.trim();

    if (!name) return;

    try {
      await API.updateSubject(id, { name, description: desc });
      this.closeModals();
      if (this.state.currentPage === 'subject' && this.state.currentSubject?.id === id) {
        await this.loadSubject(id);
      } else {
        await this.loadDashboard();
      }
    } catch (e) {
      alert(e.message || 'Failed to rename subject');
    }
  },

  async confirmDeleteSubject(id, name) {
    if (!confirm(`Are you sure you want to delete '${name}' and all its uploaded presentations?`)) return;
    try {
      await API.deleteSubject(id);
      await this.loadDashboard();
      if (this.state.currentPage === 'subject') {
        this.navigate('dashboard');
      }
    } catch (e) {
      alert(e.message || 'Failed to delete subject');
    }
  },

  openRenamePresentationModal(docId, currentName) {
    document.getElementById('modal-rename-doc-id').value = docId;
    const input = document.getElementById('modal-rename-doc-input');
    if (input) input.value = currentName.replace(/\.pptx?$/i, '');
    document.getElementById('modal-rename-doc')?.classList.remove('hidden');
    input?.focus();
  },

  async submitRenamePresentation() {
    const id = document.getElementById('modal-rename-doc-id').value;
    const name = document.getElementById('modal-rename-doc-input').value.trim();
    if (!name) return;

    try {
      await API.updateDocument(id, { name });
      this.closeModals();
      if (this.state.currentPage === 'subject' && this.state.currentSubject?.id) {
        await this.loadSubject(this.state.currentSubject.id);
      } else if (this.state.currentPage === 'presentation-learn') {
        await this.loadPresentationLearning(id);
      }
    } catch (e) {
      alert(e.message || 'Failed to rename presentation');
    }
  },

  async confirmDeletePresentation(docId, name) {
    if (!confirm(`Are you sure you want to delete '${name}'?`)) return;
    try {
      await API.deleteDocument(docId);
      if (this.state.currentSubject?.id) {
        await this.loadSubject(this.state.currentSubject.id);
      } else {
        await this.loadDashboard();
      }
    } catch (e) {
      alert(e.message || 'Failed to delete presentation');
    }
  },

  // ==================== 5. PPT UPLOAD EXPERIENCE (7 STAGES) ====================
  openUploadPptModal(preselectedSubjectId = null) {
    this.state.selectedUploadFile = null;
    this.state.uploadTargetSubjectId = preselectedSubjectId;

    const fileInput = document.getElementById('modal-ppt-file-input');
    if (fileInput) fileInput.value = '';
    const title = document.getElementById('dropzone-text-title');
    const subtitle = document.getElementById('dropzone-text-subtitle');
    if (title) title.innerText = 'Click to browse or drag and drop presentation';
    if (subtitle) subtitle.innerText = 'Accepts Microsoft PowerPoint (.ppt, .pptx)';
    
    const submitBtn = document.getElementById('modal-upload-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    const select = document.getElementById('modal-upload-subject-select');
    if (select && this.state.subjects) {
      select.innerHTML = this.state.subjects.map(s => `
        <option value="${s.id}" ${s.id === preselectedSubjectId ? 'selected' : ''}>${this.escapeHtml(s.name)}</option>
      `).join('');
    }

    document.getElementById('upload-stage-form')?.classList.remove('hidden');
    document.getElementById('upload-stage-processing')?.classList.add('hidden');
    document.getElementById('upload-stage-success')?.classList.add('hidden');
    document.getElementById('upload-modal-close-btn')?.classList.remove('hidden');

    document.getElementById('modal-upload-ppt')?.classList.remove('hidden');
  },

  openUploadPptForCurrentSubject() {
    const currentId = this.state.currentSubject?.id || null;
    this.openUploadPptModal(currentId);
  },

  handleFileSelected(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['ppt', 'pptx'].includes(ext)) {
      alert('Please select a valid PowerPoint presentation (.ppt or .pptx)');
      return;
    }

    this.state.selectedUploadFile = file;
    const title = document.getElementById('dropzone-text-title');
    const subtitle = document.getElementById('dropzone-text-subtitle');
    if (title) title.innerText = file.name;
    if (subtitle) subtitle.innerText = `${(file.size / (1024 * 1024)).toFixed(2)} MB • Ready to analyze`;

    const submitBtn = document.getElementById('modal-upload-submit-btn');
    if (submitBtn) submitBtn.disabled = false;
  },

  async startUploadAndProcess() {
    const file = this.state.selectedUploadFile;
    if (!file) return;

    const select = document.getElementById('modal-upload-subject-select');
    const subjectId = select ? select.value : (this.state.currentSubject?.id || null);

    document.getElementById('upload-stage-form')?.classList.add('hidden');
    document.getElementById('upload-stage-processing')?.classList.remove('hidden');
    document.getElementById('upload-modal-close-btn')?.classList.add('hidden');

    const filenameDisplay = document.getElementById('upload-processing-filename');
    if (filenameDisplay) filenameDisplay.innerText = file.name;

    const activateStage = async (stageNum, durationMs = 600) => {
      for (let i = 1; i < stageNum; i++) {
        const el = document.getElementById(`stage-step-${i}`);
        if (el) {
          el.className = 'stage-item completed';
          el.querySelector('.stage-indicator').innerHTML = '✓';
        }
      }
      const cur = document.getElementById(`stage-step-${stageNum}`);
      if (cur) cur.className = 'stage-item active';
      await new Promise(r => setTimeout(r, durationMs));
    };

    try {
      await activateStage(1, 400);
      const formData = new FormData();
      formData.append('file', file);
      if (subjectId) formData.append('subject_id', subjectId);

      await activateStage(2, 500);

      const uploadResp = await API.uploadDocument(formData);
      const docId = uploadResp.id;
      this.state.newUploadedDocId = docId;

      await activateStage(3, 500);
      await activateStage(4, 600);

      const analyzePromise = API.analyzePresentation(docId);

      await activateStage(5, 700);
      await activateStage(6, 600);
      await analyzePromise;

      await activateStage(7, 400);

      for (let i = 1; i <= 7; i++) {
        const el = document.getElementById(`stage-step-${i}`);
        if (el) {
          el.className = 'stage-item completed';
          el.querySelector('.stage-indicator').innerHTML = '✓';
        }
      }

      await new Promise(r => setTimeout(r, 400));

      document.getElementById('upload-stage-processing')?.classList.add('hidden');
      document.getElementById('upload-stage-success')?.classList.remove('hidden');
      document.getElementById('upload-modal-close-btn')?.classList.remove('hidden');

      const meta = document.getElementById('upload-success-meta');
      if (meta) meta.innerText = `Processed ${uploadResp.slide_count || 1} slides into structured concepts.`;

    } catch (err) {
      alert(`Upload notice: ${err.message || 'Processing failed'}`);
      this.closeModals();
    }
  },

  openUploadedPresentation() {
    this.closeModals();
    if (this.state.newUploadedDocId) {
      this.openPresentationLearning(this.state.newUploadedDocId);
    }
  },

  closeModals() {
    document.querySelectorAll('[id^="modal-"]').forEach(m => m.classList.add('hidden'));
  },

  // ==================== SEARCH ====================
  handleSearch(query) {
    const dropdown = document.getElementById('search-dropdown');
    if (!dropdown) return;
    const q = query.trim().toLowerCase();

    if (!q || q.length < 2) {
      dropdown.classList.add('hidden');
      return;
    }

    const matchedSubjects = this.state.subjects.filter(s => s.name.toLowerCase().includes(q));

    if (matchedSubjects.length === 0) {
      dropdown.innerHTML = `<p class="text-xs text-slate-400 p-2">No matching subjects found.</p>`;
      dropdown.classList.remove('hidden');
      return;
    }

    dropdown.innerHTML = matchedSubjects.map(s => `
      <div 
        onclick="App.openSubject('${s.id}'); document.getElementById('search-dropdown').classList.add('hidden');"
        class="p-2.5 rounded-lg hover:bg-white/10 cursor-pointer transition flex items-center justify-between"
      >
        <span class="text-xs font-semibold text-white">${this.escapeHtml(s.name)}</span>
        <span class="text-[10px] text-blue-400">Open Subject</span>
      </div>
    `).join('');

    dropdown.classList.remove('hidden');
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

// Auto-boot on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
