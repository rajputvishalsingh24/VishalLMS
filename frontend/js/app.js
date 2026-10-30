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
    teachingMode: 'MBA',
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
    window.App = this;
    this.initTheme();
    this.initLucide();
    this.initStudyTimerListeners();

    // Check authentication session
    const token = localStorage.getItem('vishal_lms_token');
    try {
      const auth = await API.getCurrentUser(token);
      if (auth && auth.authenticated && auth.user) {
        if (auth.token && !localStorage.getItem('vishal_lms_token')) {
          localStorage.setItem('vishal_lms_token', auth.token);
        }
        this.state.currentUser = auth.user;
        const nameEl = document.getElementById('header-user-name');
        if (nameEl) nameEl.innerText = auth.user.full_name || 'Vishal Singh';
      }
    } catch (e) {
      console.warn('Auth check notice:', e);
    }

    // Support browser back/forward history navigation
    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.pageId) {
        this.navigate(e.state.pageId, e.state.options || {}, false);
      } else {
        this.navigate('dashboard', {}, false);
      }
    });

    // Support keyboard arrow navigation for slide presentation viewer
    window.addEventListener('keydown', (e) => {
      if (this.state.currentPage === 'presentation-learn') {
        if (e.target && ['input', 'textarea', 'select'].includes(e.target.tagName?.toLowerCase())) return;
        const activeTab = document.getElementById('learn-tab-ppt-viewer');
        if (activeTab && !activeTab.classList.contains('hidden')) {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this.prevSlide();
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            this.nextSlide();
          }
        }
      }
    });

    // Check initial URL hash
    const rawHash = window.location.hash.replace(/^#/, '');
    if (rawHash) {
      const parts = rawHash.split('/');
      const page = parts[0];
      const id = parts[1];
      if (page === 'subject' && id) {
        await this.navigate('subject', { subjectId: id }, false);
      } else if (page === 'presentation-learn' && id) {
        await this.navigate('presentation-learn', { docId: id }, false);
      } else if (['tutor', 'practice', 'revision', 'mba-tools', 'progress'].includes(page)) {
        await this.navigate(page, {}, false);
      } else {
        await this.loadDashboard();
      }
    } else {
      await this.loadDashboard();
    }
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
  async navigate(pageId, options = {}, pushHistory = true) {
    // If leaving presentation-learn, stop/flush study timer
    if (this.state.currentPage === 'presentation-learn' && pageId !== 'presentation-learn') {
      this.stopStudyTimer();
    }

    this.state.currentPage = pageId;

    if (pushHistory) {
      const hash = `#${pageId}${options.subjectId ? '/' + options.subjectId : ''}${options.docId ? '/' + options.docId : ''}`;
      window.history.pushState({ pageId, options }, '', hash);
    }

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
    } else if (pageId === 'tutor') {
      await this.loadTutorPage();
    } else if (pageId === 'practice') {
      await this.loadPracticePage();
    } else if (pageId === 'revision') {
      await this.loadRevisionPage();
    } else if (pageId === 'mba-tools') {
      await this.loadMbaToolsPage();
    }

    this.initLucide();
  },

  async loadSubjects() {
    try {
      const subjects = await API.getSubjects();
      this.state.subjects = Array.isArray(subjects) ? subjects : [];
      return this.state.subjects;
    } catch (e) {
      console.error('Failed to load subjects:', e);
      return [];
    }
  },

  // ==================== 1. MAIN DASHBOARD: INTERACTIVE SOLAR SYSTEM UNIVERSE ====================
  activeSemesterFilter: 'All',
  subjectSearchQuery: '',
  subjectViewMode: 'solar', // 'solar' | 'list'
  isSolarAnimationPaused: false,
  solarAnimationId: null,
  solarPlanets: [],
  solarStars: [],
  hoveredSolarPlanet: null,
  selectedSolarPlanet: null,
  solarCanvasInitialized: false,

  planetArchetypes: [
    {
      name: 'Mercury',
      radius: 18,
      colors: ['#F59E0B', '#B45309', '#78350F'],
      glowColor: 'rgba(245, 158, 11, 0.45)',
      hasRings: false
    },
    {
      name: 'Venus',
      radius: 21,
      colors: ['#FBBF24', '#D97706', '#92400E'],
      glowColor: 'rgba(251, 191, 36, 0.45)',
      hasRings: false
    },
    {
      name: 'Earth',
      radius: 23,
      colors: ['#38BDF8', '#0284C7', '#0369A1'],
      glowColor: 'rgba(56, 189, 248, 0.55)',
      hasRings: false
    },
    {
      name: 'Mars',
      radius: 19,
      colors: ['#F87171', '#DC2626', '#991B1B'],
      glowColor: 'rgba(239, 68, 68, 0.5)',
      hasRings: false
    },
    {
      name: 'Jupiter',
      radius: 28,
      colors: ['#FDE68A', '#D97706', '#78350F'],
      glowColor: 'rgba(245, 158, 11, 0.4)',
      hasRings: false
    },
    {
      name: 'Saturn',
      radius: 25,
      colors: ['#FDE047', '#EAB308', '#A16207'],
      glowColor: 'rgba(250, 204, 21, 0.45)',
      hasRings: true,
      ringColor: 'rgba(250, 204, 21, 0.7)'
    },
    {
      name: 'Uranus',
      radius: 22,
      colors: ['#67E8F9', '#06B6D4', '#0E7490'],
      glowColor: 'rgba(34, 211, 238, 0.5)',
      hasRings: true,
      ringColor: 'rgba(34, 211, 238, 0.55)'
    },
    {
      name: 'Neptune',
      radius: 22,
      colors: ['#60A5FA', '#2563EB', '#1E3A8A'],
      glowColor: 'rgba(59, 130, 246, 0.55)',
      hasRings: false
    }
  ],

  setSubjectViewMode(mode) {
    this.subjectViewMode = mode;
    const btnSolar = document.getElementById('btn-view-solar');
    const btnList = document.getElementById('btn-view-list');

    if (mode === 'solar') {
      if (btnSolar) btnSolar.className = 'px-2.5 py-1.5 rounded-lg font-semibold transition flex items-center space-x-1.5 text-white bg-blue-600 shadow-sm';
      if (btnList) btnList.className = 'px-2.5 py-1.5 rounded-lg font-medium transition flex items-center space-x-1.5 text-slate-400 hover:text-white';
    } else {
      if (btnSolar) btnSolar.className = 'px-2.5 py-1.5 rounded-lg font-medium transition flex items-center space-x-1.5 text-slate-400 hover:text-white';
      if (btnList) btnList.className = 'px-2.5 py-1.5 rounded-lg font-semibold transition flex items-center space-x-1.5 text-white bg-blue-600 shadow-sm';
    }

    this.renderSubjectCards();
  },

  toggleSolarAnimation() {
    this.isSolarAnimationPaused = !this.isSolarAnimationPaused;
    const icon = document.getElementById('solar-play-icon');
    const text = document.getElementById('solar-play-text');

    if (this.isSolarAnimationPaused) {
      if (icon) icon.setAttribute('data-lucide', 'play');
      if (text) text.innerText = 'Resume';
    } else {
      if (icon) icon.setAttribute('data-lucide', 'pause');
      if (text) text.innerText = 'Pause';
    }
    this.initLucide();
  },

  filterSubjectsBySemester(semester) {
    this.activeSemesterFilter = semester;
    document.querySelectorAll('.subject-filter-btn').forEach(btn => {
      const sem = btn.getAttribute('data-semester-filter');
      if (sem === semester) {
        btn.className = 'subject-filter-btn px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 transition flex items-center space-x-1.5 flex-shrink-0';
      } else {
        btn.className = 'subject-filter-btn px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition flex items-center space-x-1 flex-shrink-0';
      }
    });

    // Close any open inspector during transition
    this.closeSolarInspector();
    this.renderSubjectCards();
  },

  handleSubjectCardSearch(query) {
    this.subjectSearchQuery = (query || '').toLowerCase().trim();
    this.renderSubjectCards();
  },

  renderSubjectCards() {
    const allSubjects = this.state.subjects || [];
    const countBadge = document.getElementById('subject-count-badge');
    if (countBadge) countBadge.innerText = `${allSubjects.length} ${allSubjects.length === 1 ? 'Planet' : 'Planets'}`;

    // Update semester badge counts
    const badgeAll = document.getElementById('sem-badge-all');
    if (badgeAll) badgeAll.innerText = allSubjects.length;

    for (let semNum = 1; semNum <= 6; semNum++) {
      const bEl = document.getElementById(`sem-badge-${semNum}`);
      if (bEl) {
        const c = allSubjects.filter(s => (s.semester || 'Semester 1') === `Semester ${semNum}`).length;
        bEl.innerText = c;
      }
    }

    // Filter subjects
    let filtered = allSubjects;
    if (this.activeSemesterFilter && this.activeSemesterFilter !== 'All') {
      filtered = filtered.filter(s => (s.semester || 'Semester 1') === this.activeSemesterFilter);
    }
    if (this.subjectSearchQuery) {
      const q = this.subjectSearchQuery;
      filtered = filtered.filter(s =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q)) ||
        (s.goals && s.goals.toLowerCase().includes(q))
      );
    }

    // Update Sun aggregate stats from real database data
    let totalDocs = 0;
    let totalConcepts = 0;
    let totalProg = 0;
    allSubjects.forEach(s => {
      totalDocs += (s.document_count || (s.documents ? s.documents.length : 0));
      totalConcepts += (s.concepts_count || s.studied_count || 0);
      totalProg += (s.avg_progress || 0);
    });
    const avgProg = allSubjects.length > 0 ? Math.round(totalProg / allSubjects.length) : 0;

    const sunHeadline = document.getElementById('sun-stats-headline');
    const sunDocs = document.getElementById('sun-stat-docs');
    const sunConcepts = document.getElementById('sun-stat-concepts');
    const sunProg = document.getElementById('sun-stat-prog');

    if (sunHeadline) sunHeadline.innerText = `${allSubjects.length} SUBJECTS`;
    if (sunDocs) sunDocs.innerText = `${totalDocs} Decks`;
    if (sunConcepts) sunConcepts.innerText = `${totalConcepts} Concepts`;
    if (sunProg) sunProg.innerText = `${avgProg}% Mastery`;

    const solarWrapper = document.getElementById('solar-system-wrapper');
    const listContainer = document.getElementById('subjects-container');
    const emptyUniverse = document.getElementById('solar-empty-universe');

    // 1. SOLAR SYSTEM VIEW
    if (this.subjectViewMode === 'solar') {
      if (solarWrapper) solarWrapper.classList.remove('hidden');
      if (listContainer) listContainer.classList.add('hidden');

      if (filtered.length === 0) {
        this.solarPlanets = [];
        if (emptyUniverse) emptyUniverse.classList.remove('hidden');
        if (this.solarAnimationId) {
          cancelAnimationFrame(this.solarAnimationId);
          this.solarAnimationId = null;
        }
      } else {
        if (emptyUniverse) emptyUniverse.classList.add('hidden');
        this.startSolarSystemEngine(filtered);
      }
      return;
    }

    // 2. LIST / GRID VIEW
    if (solarWrapper) solarWrapper.classList.add('hidden');
    if (listContainer) listContainer.classList.remove('hidden');
    if (this.solarAnimationId) {
      cancelAnimationFrame(this.solarAnimationId);
      this.solarAnimationId = null;
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="col-span-full py-12 text-center glass-panel rounded-3xl border border-white/10 p-8">
          <div class="w-12 h-12 rounded-2xl bg-white/5 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <i data-lucide="search-x" class="w-6 h-6"></i>
          </div>
          <h4 class="text-sm font-bold text-white mb-1">Your universe is waiting to expand.</h4>
          <p class="text-xs text-slate-400 mb-4">No subjects match this semester or search query.</p>
          <button onclick="App.openCreateSubjectModal(App.activeSemesterFilter)" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition">
            + Create Subject
          </button>
        </div>
      `;
      this.initLucide();
      return;
    }

    const gradients = [
      'from-blue-600 to-indigo-600',
      'from-cyan-600 to-blue-700',
      'from-violet-600 to-purple-800',
      'from-emerald-600 to-teal-700',
      'from-amber-600 to-orange-700',
      'from-rose-600 to-pink-700'
    ];

    listContainer.innerHTML = filtered.map((s, idx) => {
      const grad = gradients[idx % gradients.length];
      const desc = s.description || 'MBA curriculum and study presentation slides.';
      const count = s.document_count !== undefined ? s.document_count : (s.documents ? s.documents.length : 0);
      const category = s.category || 'Management';
      const semester = s.semester || 'Semester 1';
      const goals = s.goals ? `<p class="text-[11px] text-amber-300/80 mt-2 line-clamp-1 flex items-center space-x-1"><i data-lucide="target" class="w-3 h-3 text-amber-400 flex-shrink-0"></i><span class="truncate">${this.escapeHtml(s.goals)}</span></p>` : '';

      return `
        <div class="subject-card glass-panel p-6 rounded-3xl border border-white/10 flex flex-col justify-between group">
          <div>
            <div class="flex items-center justify-between mb-3">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr ${grad} text-white flex items-center justify-center font-bold text-lg shadow-md group-hover:scale-105 transition-transform">
                <i data-lucide="book-open" class="w-6 h-6"></i>
              </div>

              <div class="flex items-center space-x-1">
                <button 
                  onclick="App.openRenameSubjectModal('${s.id}', '${this.escapeHtml(s.name)}', '${this.escapeHtml(s.description || '')}', '${this.escapeHtml(semester)}', '${this.escapeHtml(category)}', '${this.escapeHtml(s.goals || '')}')" 
                  class="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
                  title="Edit Subject"
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

            <div class="flex items-center space-x-2 mb-2 flex-wrap gap-y-1">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/20">${this.escapeHtml(category)}</span>
              <span class="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/10">${this.escapeHtml(semester)}</span>
            </div>

            <h3 class="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
              ${this.escapeHtml(s.name)}
            </h3>
            <p class="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
              ${this.escapeHtml(desc)}
            </p>
            ${goals}
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
              <span>ENTER SUBJECT</span>
              <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.initLucide();
  },

  startSolarSystemEngine(subjects) {
    const canvas = document.getElementById('solar-system-canvas');
    if (!canvas) return;

    if (this.solarAnimationId) {
      cancelAnimationFrame(this.solarAnimationId);
      this.solarAnimationId = null;
    }

    // Check prefers-reduced-motion
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.isSolarAnimationPaused = true;
    }

    // Initialize stars background
    if (this.solarStars.length === 0) {
      for (let i = 0; i < 140; i++) {
        this.solarStars.push({
          x: Math.random(),
          y: Math.random(),
          size: Math.random() * 1.8 + 0.6,
          brightness: Math.random() * 0.7 + 0.3,
          twinkleSpeed: Math.random() * 0.03 + 0.01,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    // Build planets with distinct archetypes and Keplerian orbits
    const count = subjects.length;
    const baseRadiusX = count <= 3 ? 120 : (count <= 5 ? 100 : 85);
    const stepRadiusX = count <= 3 ? 65 : (count <= 5 ? 48 : 36);

    this.solarPlanets = subjects.map((s, idx) => {
      const archetype = this.planetArchetypes[idx % this.planetArchetypes.length];
      const orbitRx = baseRadiusX + idx * stepRadiusX;
      const orbitRy = orbitRx * 0.52; // isometric elliptical view
      const angle = (idx * (2 * Math.PI / count)) + (Math.PI / 6);
      const speed = (0.0035 + (0.002 / (idx + 1))) * (idx % 2 === 0 ? 1 : 1.15);

      return {
        id: s.id,
        subject: s,
        name: s.name,
        semester: s.semester || 'Semester 1',
        category: s.category || 'Management',
        docCount: s.document_count !== undefined ? s.document_count : (s.documents ? s.documents.length : 0),
        progress: s.avg_progress || 0,
        radius: archetype.radius,
        colors: archetype.colors,
        glowColor: archetype.glowColor,
        hasRings: archetype.hasRings,
        ringColor: archetype.ringColor,
        orbitRx,
        orbitRy,
        angle,
        speed,
        x: 0,
        y: 0
      };
    });

    // Attach event listeners only once
    if (!this.solarCanvasInitialized) {
      this.attachSolarEventListeners(canvas);
      this.solarCanvasInitialized = true;
    }

    // Start 60fps render loop
    const renderLoop = () => {
      this.drawSolarSystemFrame(canvas);
      this.solarAnimationId = requestAnimationFrame(renderLoop);
    };
    this.solarAnimationId = requestAnimationFrame(renderLoop);
  },

  attachSolarEventListeners(canvas) {
    const handleMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : null);
      const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : null);
      if (clientX === null || clientY === null) return;

      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;

      let found = null;
      for (const p of this.solarPlanets) {
        const dist = Math.hypot(mouseX - p.x, mouseY - p.y);
        if (dist <= p.radius + 14) {
          found = p;
          break;
        }
      }

      this.hoveredSolarPlanet = found;
      canvas.style.cursor = found ? 'pointer' : 'default';

      const tooltip = document.getElementById('solar-planet-tooltip');
      if (tooltip) {
        if (found) {
          tooltip.innerHTML = `
            <div class="flex items-center space-x-1.5 font-bold text-white">
              <span class="w-2 h-2 rounded-full" style="background:${found.colors[0]}"></span>
              <span class="truncate">${this.escapeHtml(found.name)}</span>
            </div>
            <div class="flex items-center justify-between text-[11px] text-slate-300 pt-1 border-t border-white/10">
              <span class="text-slate-400">${this.escapeHtml(found.semester)}</span>
              <span class="text-cyan-300 font-semibold">${found.docCount} Decks</span>
            </div>
            <div class="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mt-1">
              <div class="bg-gradient-to-r from-blue-500 to-emerald-400 h-full rounded-full" style="width: ${Math.max(5, found.progress)}%"></div>
            </div>
          `;
          tooltip.style.left = `${Math.min(rect.width - 230, Math.max(10, found.x + 15))}px`;
          tooltip.style.top = `${Math.min(rect.height - 100, Math.max(10, found.y - 40))}px`;
          tooltip.classList.remove('hidden');
        } else {
          tooltip.classList.add('hidden');
        }
      }
    };

    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX || (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : null);
      const clientY = e.clientY || (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : null);
      if (clientX === null || clientY === null) return;

      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;

      let clickedPlanet = null;
      for (const p of this.solarPlanets) {
        const dist = Math.hypot(clickX - p.x, clickY - p.y);
        if (dist <= p.radius + 16) {
          clickedPlanet = p;
          break;
        }
      }

      if (clickedPlanet) {
        this.selectSolarPlanet(clickedPlanet);
      }
    };

    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseleave', () => {
      this.hoveredSolarPlanet = null;
      document.getElementById('solar-planet-tooltip')?.classList.add('hidden');
    });
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchmove', handleMove, { passive: true });
    canvas.addEventListener('touchend', handleClick);
  },

  selectSolarPlanet(planet) {
    this.selectedSolarPlanet = planet;
    const inspector = document.getElementById('solar-planet-inspector');
    if (!inspector) return;

    const s = planet.subject;
    const desc = s.description || 'MBA curriculum with slide-by-slide concepts and AI tutor.';
    const count = planet.docCount;
    const prog = planet.progress || 0;

    inspector.innerHTML = `
      <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div class="flex items-center space-x-2.5 min-w-0">
          <div class="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white shadow-md flex-shrink-0" style="background: radial-gradient(circle, ${planet.colors[0]}, ${planet.colors[1]})">
            🪐
          </div>
          <div class="min-w-0">
            <h4 class="text-xs sm:text-sm font-bold text-white truncate">${this.escapeHtml(planet.name)}</h4>
            <p class="text-[10px] text-slate-400">${this.escapeHtml(planet.semester)} • ${this.escapeHtml(planet.category)}</p>
          </div>
        </div>
        <button onclick="App.closeSolarInspector()" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition flex-shrink-0">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <p class="text-slate-300 text-[11px] line-clamp-2 leading-relaxed">
        ${this.escapeHtml(desc)}
      </p>

      <div class="grid grid-cols-2 gap-2 text-[10px]">
        <div class="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 space-y-0.5">
          <span class="text-slate-400">Study Materials</span>
          <p class="text-white font-bold text-xs">${count} ${count === 1 ? 'Presentation' : 'Presentations'}</p>
        </div>
        <div class="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 space-y-0.5">
          <span class="text-slate-400">Mastery Level</span>
          <p class="text-emerald-400 font-bold text-xs">${prog}% Complete</p>
        </div>
      </div>

      <div class="flex items-center space-x-2 pt-1">
        <button 
          onclick="App.openSubject('${planet.id}')"
          class="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-500/30 transition flex items-center justify-center space-x-1.5"
        >
          <span>ENTER SUBJECT</span>
          <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
        </button>
        <button 
          onclick="App.openRenameSubjectModal('${planet.id}', '${this.escapeHtml(s.name)}', '${this.escapeHtml(s.description || '')}', '${this.escapeHtml(planet.semester)}', '${this.escapeHtml(planet.category)}', '${this.escapeHtml(s.goals || '')}')"
          class="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition"
          title="Edit Subject"
        >
          <i data-lucide="edit-3" class="w-4 h-4"></i>
        </button>
      </div>
    `;

    inspector.classList.remove('hidden');
    this.initLucide();
  },

  closeSolarInspector() {
    this.selectedSolarPlanet = null;
    const inspector = document.getElementById('solar-planet-inspector');
    if (inspector) inspector.classList.add('hidden');
  },

  drawSolarSystemFrame(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const cx = width / 2;
    const cy = height / 2;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw subtle background space nebula gradient
    const nebulaGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, width * 0.6);
    nebulaGrad.addColorStop(0, 'rgba(15, 23, 42, 0.9)');
    nebulaGrad.addColorStop(0.5, 'rgba(10, 15, 30, 0.95)');
    nebulaGrad.addColorStop(1, '#050814');
    ctx.fillStyle = nebulaGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw twinkling stars
    const now = performance.now();
    for (const star of this.solarStars) {
      const sx = star.x * width;
      const sy = star.y * height;
      const alpha = star.brightness * (0.6 + 0.4 * Math.sin(now * star.twinkleSpeed + star.phase));
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Update planetary angles & positions
    if (!this.isSolarAnimationPaused) {
      for (const p of this.solarPlanets) {
        p.angle += p.speed;
      }
    }

    for (const p of this.solarPlanets) {
      p.x = cx + p.orbitRx * Math.cos(p.angle);
      p.y = cy + p.orbitRy * Math.sin(p.angle);
    }

    // 4. Draw orbital paths (ellipses)
    for (const p of this.solarPlanets) {
      const isHighlighted = (this.hoveredSolarPlanet && this.hoveredSolarPlanet.id === p.id) || (this.selectedSolarPlanet && this.selectedSolarPlanet.id === p.id);
      ctx.beginPath();
      ctx.ellipse(cx, cy, p.orbitRx, p.orbitRy, 0, 0, Math.PI * 2);
      ctx.strokeStyle = isHighlighted ? 'rgba(96, 165, 250, 0.45)' : 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = isHighlighted ? 1.5 : 1;
      if (!isHighlighted) {
        ctx.setLineDash([3, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Split planets into back-layer (behind Sun) and front-layer (in front of Sun)
    const backPlanets = this.solarPlanets.filter(p => Math.sin(p.angle) < 0);
    const frontPlanets = this.solarPlanets.filter(p => Math.sin(p.angle) >= 0);

    // 5. Draw back-layer planets
    for (const p of backPlanets) {
      this.drawSinglePlanet(ctx, p);
    }

    // 6. Draw glowing Central Sun
    this.drawCentralSun(ctx, cx, cy);

    // 7. Draw front-layer planets
    for (const p of frontPlanets) {
      this.drawSinglePlanet(ctx, p);
    }

    ctx.restore();
  },

  drawCentralSun(ctx, cx, cy) {
    const time = performance.now() * 0.0015;
    const pulse = 1 + 0.04 * Math.sin(time * 2);

    // Outer coronal flares
    const flareGrad = ctx.createRadialGradient(cx, cy, 35, cx, cy, 80 * pulse);
    flareGrad.addColorStop(0, 'rgba(245, 158, 11, 0.35)');
    flareGrad.addColorStop(0.5, 'rgba(234, 88, 12, 0.15)');
    flareGrad.addColorStop(1, 'rgba(234, 88, 12, 0)');
    ctx.fillStyle = flareGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 80 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright glowing core
    const coreGrad = ctx.createRadialGradient(cx - 10, cy - 10, 5, cx, cy, 50);
    coreGrad.addColorStop(0, '#FEF08A');
    coreGrad.addColorStop(0.3, '#F59E0B');
    coreGrad.addColorStop(0.8, '#D97706');
    coreGrad.addColorStop(1, '#9A3412');

    ctx.save();
    ctx.shadowColor = '#F59E0B';
    ctx.shadowBlur = 30;
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 48 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  drawSinglePlanet(ctx, p) {
    const isHovered = this.hoveredSolarPlanet && this.hoveredSolarPlanet.id === p.id;
    const isSelected = this.selectedSolarPlanet && this.selectedSolarPlanet.id === p.id;
    const r = (isHovered || isSelected) ? p.radius * 1.18 : p.radius;

    ctx.save();

    // 1. Planetary glow aura
    ctx.shadowColor = p.glowColor;
    ctx.shadowBlur = (isHovered || isSelected) ? 22 : 12;

    // 2. Planet sphere with 3D radial lighting
    const grad = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
    grad.addColorStop(0, p.colors[0]);
    grad.addColorStop(0.6, p.colors[1]);
    grad.addColorStop(1, p.colors[2]);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    // 3. Optional Saturn / Uranus Planetary Rings
    if (p.hasRings) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(-0.35); // ring tilt
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.85, r * 0.55, 0, 0, Math.PI * 2);
      ctx.strokeStyle = p.ringColor || 'rgba(250, 204, 21, 0.65)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // 4. Focus halo if selected
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 5. Subject Label Tag
    ctx.shadowBlur = 0;
    const labelText = p.name.length > 18 ? p.name.substring(0, 16) + '..' : p.name;
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textMetrics = ctx.measureText(labelText);
    const textWidth = textMetrics.width;
    const tagY = p.y + r + 13;

    // Pill background
    ctx.fillStyle = isHovered || isSelected ? 'rgba(37, 99, 235, 0.85)' : 'rgba(15, 23, 42, 0.75)';
    ctx.strokeStyle = isHovered || isSelected ? 'rgba(96, 165, 250, 0.6)' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(p.x - textWidth / 2 - 6, tagY - 7, textWidth + 12, 14, 7);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = isHovered || isSelected ? '#FFFFFF' : '#E2E8F0';
    ctx.fillText(labelText, p.x, tagY);

    ctx.restore();
  },
  async loadDashboard() {
    try {
      await this.loadSubjects();

      const countBadge = document.getElementById('subject-count-badge');
      if (countBadge) countBadge.innerText = `${this.state.subjects.length} Subjects`;

      this.renderSubjectCards();
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
          const pStatus = (doc.processing_status || doc.status || 'completed').toLowerCase();

          let statusBadge = '';
          let actionButton = '';

          if (pStatus === 'failed') {
            statusBadge = `
              <span class="inline-flex items-center space-x-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20">
                <i data-lucide="alert-circle" class="w-3 h-3 text-rose-400"></i>
                <span>Processing Notice</span>
              </span>
            `;
            actionButton = `
              <button 
                onclick="App.retryProcessing('${doc.id}', this)"
                class="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition shadow-md flex items-center justify-center space-x-1.5"
              >
                <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                <span>Retry Processing</span>
              </button>
            `;
          } else if (pStatus === 'processing' || pStatus === 'uploading') {
            statusBadge = `
              <span class="inline-flex items-center space-x-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                <span>Extracting Slides...</span>
              </span>
            `;
            actionButton = `
              <button 
                onclick="App.retryProcessing('${doc.id}', this)"
                class="w-full py-2.5 rounded-xl bg-amber-600/30 hover:bg-amber-600 text-amber-200 hover:text-white font-semibold text-xs transition border border-amber-500/40 flex items-center justify-center space-x-1.5"
              >
                <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                <span>Re-process Slides</span>
              </button>
            `;
          } else {
            statusBadge = `
              <span class="inline-flex items-center space-x-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Ready to Learn</span>
              </span>
            `;
            actionButton = `
              <button 
                onclick="App.openPresentationLearning('${doc.id}')"
                class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition shadow-md shadow-blue-600/20 flex items-center justify-center space-x-1.5"
              >
                <i data-lucide="play-circle" class="w-4 h-4"></i>
                <span>Open & Learn</span>
              </button>
            `;
          }

          return `
            <div class="ppt-card glass-panel p-6 rounded-3xl border border-white/10 flex flex-col justify-between group">
              <div>
                <div class="flex items-center justify-between mb-3">
                  ${statusBadge}

                  <div class="flex items-center space-x-1">
                    <a 
                      href="/api/documents/${doc.id}/download" 
                      download 
                      class="p-1.5 text-slate-400 hover:text-cyan-400 rounded-lg hover:bg-white/5 transition"
                      title="Download Original File"
                    >
                      <i data-lucide="download" class="w-3.5 h-3.5"></i>
                    </a>
                    <button 
                      onclick="App.reprocessPresentation('${doc.id}')" 
                      class="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg hover:bg-white/5 transition"
                      title="Reprocess Presentation"
                    >
                      <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                    </button>
                    <button 
                      onclick="App.openMoveDeckModal('${doc.id}')" 
                      class="p-1.5 text-slate-400 hover:text-purple-400 rounded-lg hover:bg-white/5 transition"
                      title="Move Presentation to Another Subject"
                    >
                      <i data-lucide="folder-symlink" class="w-3.5 h-3.5"></i>
                    </button>
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
                ${actionButton}
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

  async retryProcessing(docId, btnEl = null) {
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = `<span class="inline-block animate-spin mr-1">⏳</span><span>Processing...</span>`;
    }
    try {
      await API.retryDocumentProcessing(docId);
      if (this.state.currentSubject?.id) {
        await this.loadSubject(this.state.currentSubject.id);
      } else {
        await this.loadDashboard();
      }
    } catch (e) {
      alert(e.message || 'Processing retry failed. Please try again.');
      if (this.state.currentSubject?.id) {
        await this.loadSubject(this.state.currentSubject.id);
      }
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

  async setTeachingMode(mode) {
    this.state.teachingMode = mode;
    this.currentTeachingMode = mode;

    // Update Detailed Learning Concept Mode pills
    document.querySelectorAll('.teaching-mode-pill').forEach(pill => {
      pill.className = 'teaching-mode-pill px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 text-slate-400 hover:text-white hover:bg-white/5';
    });
    const activeBtn = document.getElementById(`mode-btn-${mode}`);
    if (activeBtn) {
      activeBtn.className = 'teaching-mode-pill active px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 text-white bg-blue-600 shadow-sm';
    }
    const modeBadge = document.getElementById('concept-mode-badge');
    if (modeBadge) {
      modeBadge.innerText = `${mode} Mode`;
    }

    // Update AI Tutor page pills
    document.querySelectorAll('.tutor-mode-pill').forEach(btn => {
      if (btn.getAttribute('data-tutor-mode') === mode) {
        btn.className = 'tutor-mode-pill px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 shadow-sm transition';
      } else {
        btn.className = 'tutor-mode-pill px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white transition';
      }
    });
    const label = document.getElementById('current-tutor-mode-label');
    if (label) {
      const modeNames = { Beginner: '🌱 Beginner (ELI5)', MBA: '🏛️ MBA Professor', Exam: '📝 Exam Prep', Expert: '⚡ C-Suite Expert' };
      label.innerText = modeNames[mode] || mode;
    }

    // Update Floating Chat badge if open
    const fcMode = document.getElementById('fc-badge-mode');
    if (fcMode) fcMode.innerText = `${mode} Mode`;

    // Re-render concept package if active
    if (this.state.activeConceptName) {
      await this.fetchAndRenderConceptPackage(this.state.activeConceptName, null);
    }
  },

  async markCurrentConceptUnderstood() {
    if (!this.state.currentDocId || !this.state.activeConceptName) return;
    try {
      const resp = await API.updatePresentationSession(this.state.currentDocId, {
        mark_understood: this.state.activeConceptName
      });
      await API.updateConceptStatus(this.state.currentDocId, this.state.activeConceptName, 'Understood');
      if (this.state.currentSession) {
        this.state.currentSession.understood_concepts = resp.understood_concepts || [];
      }
      this.updateMarkUnderstoodButton(true);
    } catch (e) {
      console.error('Error marking concept understood:', e);
    }
  },

  updateMarkUnderstoodButton(isUnderstood) {
    const btn = document.getElementById('mark-understood-btn');
    const txt = document.getElementById('mark-understood-btn-text');
    if (!btn || !txt) return;
    if (isUnderstood) {
      btn.className = 'px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs transition flex items-center space-x-1.5 shadow-md shadow-emerald-500/20';
      txt.innerText = 'Understood ✓';
    } else {
      btn.className = 'px-3.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-semibold text-xs transition flex items-center space-x-1.5 shadow-sm';
      txt.innerText = 'Mark as Understood';
    }
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
      const mode = this.state.teachingMode || 'MBA';
      const pkg = await API.teachPresentationConcept(this.state.currentDocId, conceptName, controlAction, mode);
      
      this.state.currentSlideNumber = pkg.slide_number || 1;

      const titleDisplay = document.getElementById('concept-title-display');
      const controlBadge = document.getElementById('concept-control-badge');
      const modeBadge = document.getElementById('concept-mode-badge');
      const slideBadge = document.getElementById('concept-slide-badge');
      const citationText = document.getElementById('concept-slide-citation-text');
      const counterIndicator = document.getElementById('concept-counter-indicator');

      if (titleDisplay) titleDisplay.innerText = pkg.concept_name;
      if (controlBadge) controlBadge.innerText = pkg.control_title || 'Standard MBA Masterclass';
      if (modeBadge) modeBadge.innerText = `${pkg.teaching_mode || mode} Mode`;
      if (slideBadge) slideBadge.innerText = `Slide ${pkg.slide_number}`;
      if (citationText) citationText.innerText = `Source: Slide ${pkg.slide_number}`;
      if (counterIndicator) counterIndicator.innerText = `${(pkg.concept_index || 0) + 1} of ${pkg.total_concepts || 1}`;

      // Update understood button state
      const isUnderstood = (this.state.currentSession?.understood_concepts || []).includes(pkg.concept_name);
      this.updateMarkUnderstoodButton(isUnderstood);

      await API.updatePresentationSession(this.state.currentDocId, {
        current_concept_name: pkg.concept_name,
        current_slide_number: pkg.slide_number
      });

      this.render10PedagogicalSections(pkg);

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
            <a href="https://hbr.org" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-xl bg-cyan-900/30 text-cyan-300 text-xs flex items-center space-x-1">
              <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              <span>Harvard Business Review Case Studies</span>
            </a>
          `;
        }
      }

      this.initLucide();
    } catch (e) {
      console.error('Error fetching concept teaching package:', e);
    }
  },

  render10PedagogicalSections(pkg) {
    const container = document.getElementById('concept-sections-container') || document.getElementById('concept-steps-container');
    if (!container) return;

    // 1. RENDER ADAPTIVE RECOMMENDATION BANNER
    const recBanner = document.getElementById('adaptive-recommendation-banner');
    if (recBanner) {
      const rec = pkg.adaptive_recommendation;
      if (rec) {
        recBanner.className = `p-4 sm:p-5 rounded-2xl border ${rec.badge_class || 'border-blue-500/30 bg-blue-500/10'} mb-6 space-y-2 animate-fade-in`;
        recBanner.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold flex-shrink-0">
                <i data-lucide="sparkles" class="w-4 h-4 text-amber-300"></i>
              </span>
              <span class="text-xs sm:text-sm font-bold text-white tracking-wide">${this.escapeHtml(rec.headline || 'Personalized Teaching Advice')}</span>
            </div>
            <span class="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${rec.badge_class || 'bg-blue-500/20 text-blue-300'}">${this.escapeHtml(rec.badge || 'Adaptive')}</span>
          </div>
          <p class="text-xs sm:text-sm text-slate-200 leading-relaxed">${this.escapeHtml(rec.message || '')}</p>
        `;
        recBanner.classList.remove('hidden');
      } else {
        recBanner.classList.add('hidden');
      }
    }

    const mode = pkg.teaching_mode || this.state.teachingMode || 'MBA';
    const md = pkg.mode_data || {};
    let html = '';

    // ==========================================
    // 2. TEACHING MODE 1: BEGINNER (The Patient Teacher - 9 Parts)
    // ==========================================
    if (mode === 'Beginner') {
      html += `
        <!-- MODE HEADER -->
        <div class="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <span class="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center text-sm">🌱</span>
            <div>
              <h4 class="text-sm font-bold text-white">Beginner Mode: The Patient Teacher</h4>
              <p class="text-[11px] text-emerald-300/80">Zero prior knowledge assumed • Intuitive real-life analogies • Step-by-step foundation</p>
            </div>
          </div>
          <span class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">9-Part Learning Guide</span>
        </div>

        <!-- PART 1: WHAT ARE WE LEARNING? -->
        <div class="glass-panel p-6 rounded-2xl border border-blue-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center font-extrabold text-xs">1</span>
            <span>What Are We Learning?</span>
          </div>
          <div class="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.what_are_we_learning || '')}
          </div>
        </div>

        <!-- PART 2: WHY DOES IT MATTER? -->
        <div class="glass-panel p-6 rounded-2xl border border-indigo-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-extrabold text-xs">2</span>
            <span>Why Does It Matter?</span>
          </div>
          <div class="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.why_does_it_matter || '')}
          </div>
        </div>

        <!-- PART 3: SIMPLE DEFINITION -->
        <div class="glass-panel p-6 rounded-2xl border border-cyan-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-extrabold text-xs">3</span>
            <span>Simple Definition</span>
          </div>
          <div class="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs sm:text-sm text-cyan-100 leading-relaxed">
            ${this.renderMarkdown(md.simple_definition || '')}
          </div>
        </div>

        <!-- PART 4: EVERYDAY ANALOGY -->
        <div class="glass-panel p-6 rounded-2xl border border-amber-500/20 space-y-3 bg-amber-500/[0.02]">
          <div class="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center font-extrabold text-xs">4</span>
            <span>Everyday Analogy (Intuitive Mapping)</span>
          </div>
          <div class="p-4 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs sm:text-sm text-amber-100 leading-relaxed">
            💡 ${this.renderMarkdown(md.everyday_analogy || '')}
          </div>
        </div>

        <!-- PART 5: STEP-BY-STEP BREAKDOWN -->
        <div class="glass-panel p-6 rounded-2xl border border-purple-500/20 space-y-4">
          <div class="flex items-center space-x-2 text-purple-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center font-extrabold text-xs">5</span>
            <span>Step-by-Step Breakdown</span>
          </div>
          <div class="space-y-2.5">
            ${(md.step_by_step_breakdown || []).map((step, sIdx) => `
              <div class="flex items-start space-x-3 text-xs sm:text-sm text-slate-200 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <span class="w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">${sIdx + 1}</span>
                <span class="leading-relaxed">${this.escapeHtml(step)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- PART 6: SIMPLE EXAMPLE -->
        <div class="glass-panel p-6 rounded-2xl border border-emerald-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-extrabold text-xs">6</span>
            <span>Simple Real-Life Example</span>
          </div>
          <div class="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.simple_example || '')}
          </div>
        </div>

        <!-- PART 7: PRACTICAL DAILY APPLICATION -->
        <div class="glass-panel p-6 rounded-2xl border border-teal-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-teal-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center font-extrabold text-xs">7</span>
            <span>Practical Daily Application</span>
          </div>
          <div class="p-4 rounded-xl bg-teal-950/20 border border-teal-500/20 text-xs sm:text-sm text-teal-100 leading-relaxed whitespace-pre-line">
            🎯 ${this.renderMarkdown(md.practical_application || '')}
          </div>
        </div>

        <!-- PART 8: COMMON MISUNDERSTANDING -->
        <div class="glass-panel p-6 rounded-2xl border border-rose-500/20 space-y-3 bg-rose-500/[0.01]">
          <div class="flex items-center space-x-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-rose-500/20 text-rose-300 flex items-center justify-center font-extrabold text-xs">8</span>
            <span>Common Misunderstanding & Traps</span>
          </div>
          <div class="p-4 rounded-xl bg-rose-950/20 border border-rose-500/20 text-xs sm:text-sm text-rose-200 leading-relaxed whitespace-pre-line">
            ⚠️ ${this.renderMarkdown(md.common_misunderstanding || '')}
          </div>
        </div>

        <!-- PART 9: THREE QUESTIONS TO CHECK UNDERSTANDING -->
        <div id="practice-check-section" class="glass-panel p-6 sm:p-8 rounded-2xl border border-amber-500/30 space-y-5 bg-amber-500/[0.01]">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
              <span class="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center font-extrabold text-xs">9</span>
              <span>Three Questions to Check Understanding</span>
            </div>
            <span class="text-xs text-slate-400">${(md.check_questions || []).length} Quick Check Challenges</span>
          </div>

          <div class="space-y-4">
            ${(md.check_questions || []).map((q, qIdx) => `
              <div class="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3" id="practice-card-${qIdx}">
                <div class="flex items-center space-x-2 text-xs text-amber-300 font-semibold">
                  <span>Question ${qIdx + 1}:</span>
                  <span class="text-slate-400 font-normal">(${this.escapeHtml(q.type || 'Practice')})</span>
                </div>
                <p class="text-xs sm:text-sm font-semibold text-white leading-relaxed">${this.escapeHtml(q.question)}</p>
                <div class="space-y-2">
                  ${(q.options || []).map((opt, optIdx) => `
                    <button 
                      onclick="App.handlePracticeQuestionAnswer(${qIdx}, ${optIdx}, ${q.correct_index || 0}, '${this.escapeHtml(q.explanation || '')}')"
                      class="practice-opt-btn-${qIdx} w-full text-left px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs sm:text-sm text-slate-200 transition flex items-start space-x-2"
                    >
                      <span class="w-5 h-5 rounded-full bg-white/10 text-slate-300 font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">${String.fromCharCode(65 + optIdx)}</span>
                      <span>${this.escapeHtml(opt)}</span>
                    </button>
                  `).join('')}
                </div>
                <div id="practice-feedback-${qIdx}" class="hidden text-xs p-3.5 rounded-xl"></div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // ==========================================
    // 3. TEACHING MODE 2: MBA (The Business Professor - 11 Parts)
    // ==========================================
    else if (mode === 'MBA') {
      const advLim = md.advantages_and_limitations || {};
      const caseStudy = md.business_case_study || {};

      html += `
        <!-- MODE HEADER -->
        <div class="p-4 rounded-2xl bg-blue-950/20 border border-blue-500/30 flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <span class="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-300 font-bold flex items-center justify-center text-sm">🏛️</span>
            <div>
              <h4 class="text-sm font-bold text-white">MBA Mode: The Business Professor</h4>
              <p class="text-[11px] text-blue-300/80">Executive frameworks • Strategic moats • Real-world corporate case studies</p>
            </div>
          </div>
          <span class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20">11-Part Masterclass</span>
        </div>

        <!-- PART 1: DEFINITION -->
        <div class="glass-panel p-6 rounded-2xl border border-blue-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center font-extrabold text-xs">1</span>
            <span>Executive Definition</span>
          </div>
          <div class="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.executive_definition || '')}
          </div>
        </div>

        <!-- PART 2: BUSINESS CONTEXT -->
        <div class="glass-panel p-6 rounded-2xl border border-indigo-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-extrabold text-xs">2</span>
            <span>Business Context & Macro Dynamics</span>
          </div>
          <div class="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.business_context || '')}
          </div>
        </div>

        <!-- PART 3: CONCEPTUAL EXPLANATION -->
        <div class="glass-panel p-6 rounded-2xl border border-cyan-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-extrabold text-xs">3</span>
            <span>Conceptual Explanation & Foundations</span>
          </div>
          <div class="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.conceptual_explanation || '')}
          </div>
        </div>

        <!-- PART 4: HOW IT WORKS (OPERATIONAL MECHANICS) -->
        <div class="glass-panel p-6 rounded-2xl border border-purple-500/20 space-y-4">
          <div class="flex items-center space-x-2 text-purple-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center font-extrabold text-xs">4</span>
            <span>Operational Mechanics (How It Works)</span>
          </div>
          <div class="space-y-2.5">
            ${(md.operational_mechanics || []).map((step, sIdx) => `
              <div class="flex items-start space-x-3 text-xs sm:text-sm text-slate-200 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <span class="w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">${sIdx + 1}</span>
                <span class="leading-relaxed">${this.escapeHtml(step)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- PART 5: RELEVANT MANAGEMENT FRAMEWORKS -->
        <div class="glass-panel p-6 rounded-2xl border border-amber-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center font-extrabold text-xs">5</span>
            <span>Relevant Management Frameworks</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            ${(md.management_frameworks || []).map(fw => `
              <div class="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs sm:text-sm text-amber-100 flex items-start space-x-2">
                <i data-lucide="layers" class="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"></i>
                <span>${this.escapeHtml(fw)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- PART 6: REAL-WORLD BUSINESS EXAMPLE -->
        <div class="glass-panel p-6 rounded-2xl border border-emerald-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-extrabold text-xs">6</span>
            <span>Real-World Business Example</span>
          </div>
          <div class="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-xs sm:text-sm text-slate-200 leading-relaxed space-y-2">
            <div class="flex items-center space-x-2 text-emerald-300 font-bold text-xs">
              <i data-lucide="briefcase" class="w-4 h-4"></i>
              <span>Company: ${this.escapeHtml(caseStudy.company || 'Enterprise Benchmark')}</span>
            </div>
            <p class="text-slate-300 leading-relaxed whitespace-pre-line">${this.renderMarkdown(caseStudy.case_study || '')}</p>
          </div>
        </div>

        <!-- PART 7: MANAGERIAL & PRODUCT APPLICATION -->
        <div class="glass-panel p-6 rounded-2xl border border-teal-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-teal-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center font-extrabold text-xs">7</span>
            <span>Managerial & Product Application</span>
          </div>
          <div class="p-4 rounded-xl bg-teal-950/20 border border-teal-500/20 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.managerial_application || '')}
          </div>
        </div>

        <!-- PART 8: STRATEGIC IMPLICATIONS -->
        <div class="glass-panel p-6 rounded-2xl border border-blue-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center font-extrabold text-xs">8</span>
            <span>Strategic Implications & Competitive Moats</span>
          </div>
          <div class="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.strategic_implications || '')}
          </div>
        </div>

        <!-- PART 9: ADVANTAGES AND LIMITATIONS -->
        <div class="glass-panel p-6 rounded-2xl border border-rose-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-rose-500/20 text-rose-300 flex items-center justify-center font-extrabold text-xs">9</span>
            <span>Advantages, Limitations & Common Pitfalls</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div class="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20 space-y-2">
              <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Strategic Advantages:</span>
              <ul class="space-y-1.5 text-slate-300">
                ${(advLim.advantages || []).map(a => `<li class="flex items-start space-x-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5"></i><span>${this.escapeHtml(a)}</span></li>`).join('')}
              </ul>
            </div>
            <div class="p-4 rounded-xl bg-amber-950/20 border border-amber-500/20 space-y-2">
              <span class="text-[11px] font-bold uppercase tracking-wider text-amber-300">Core Limitations:</span>
              <ul class="space-y-1.5 text-slate-300">
                ${(advLim.limitations || []).map(l => `<li class="flex items-start space-x-1.5"><i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5"></i><span>${this.escapeHtml(l)}</span></li>`).join('')}
              </ul>
            </div>
            <div class="p-4 rounded-xl bg-rose-950/20 border border-rose-500/20 space-y-2">
              <span class="text-[11px] font-bold uppercase tracking-wider text-rose-300">Common Pitfalls:</span>
              <ul class="space-y-1.5 text-slate-300">
                ${(advLim.common_pitfalls || []).map(p => `<li class="flex items-start space-x-1.5"><i data-lucide="x" class="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5"></i><span>${this.escapeHtml(p)}</span></li>`).join('')}
              </ul>
            </div>
          </div>
        </div>

        <!-- PART 10: KEY TAKEAWAYS -->
        <div class="glass-panel p-6 rounded-2xl border border-blue-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center font-extrabold text-xs">10</span>
            <span>Key Executive Takeaways</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
            ${(md.key_takeaways || []).map(tk => `
              <div class="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-start space-x-2 text-slate-200">
                <i data-lucide="check-circle" class="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5"></i>
                <span>${this.escapeHtml(tk)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- PART 11: MBA-LEVEL DISCUSSION QUESTIONS -->
        <div class="glass-panel p-6 rounded-2xl border border-indigo-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-extrabold text-xs">11</span>
            <span>MBA-Level Boardroom Discussion Questions</span>
          </div>
          <div class="space-y-2.5">
            ${(md.discussion_questions || []).map((dq, dqIdx) => `
              <div class="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 flex items-start space-x-2.5 text-xs sm:text-sm text-indigo-100">
                <span class="font-bold text-indigo-300 flex-shrink-0">Q${dqIdx + 1}:</span>
                <span class="leading-relaxed">${this.escapeHtml(dq)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // ==========================================
    // 4. TEACHING MODE 3: EXAM (The MBA Examiner - Marking Schemes)
    // ==========================================
    else if (mode === 'Exam') {
      const compTable = md.comparison_table || { headers: [], rows: [] };
      const mnemonics = md.short_notes_and_mnemonics || {};

      html += `
        <!-- MODE HEADER -->
        <div class="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <span class="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center text-sm">📝</span>
            <div>
              <h4 class="text-sm font-bold text-white">Exam Mode: The MBA Examiner</h4>
              <p class="text-[11px] text-amber-300/80">Structured marking schemes • 2, 5 & 10 Mark model answers • Comparison tables & mnemonics</p>
            </div>
          </div>
          <span class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20">University Marking Scheme</span>
        </div>

        <!-- 2-MARK ANSWER -->
        <div class="glass-panel p-6 rounded-2xl border border-cyan-500/20 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
              <span class="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-extrabold text-xs">2M</span>
              <span>2-Mark Model Answer (Concise Definition & Key Distinction)</span>
            </div>
            <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">Target: 2 Marks</span>
          </div>
          <div class="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.two_mark_answer || '')}
          </div>
        </div>

        <!-- 5-MARK ANSWER -->
        <div class="glass-panel p-6 rounded-2xl border border-indigo-500/20 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
              <span class="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-extrabold text-xs">5M</span>
              <span>5-Mark Model Answer (Intro, Theoretical Pillars & Example)</span>
            </div>
            <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Target: 5 Marks</span>
          </div>
          <div class="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.five_mark_answer || '')}
          </div>
        </div>

        <!-- 10-MARK MASTER ANSWER -->
        <div class="glass-panel p-6 rounded-2xl border border-purple-500/30 space-y-3 bg-purple-500/[0.01]">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 text-purple-400 font-bold text-xs uppercase tracking-wider">
              <span class="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center font-extrabold text-xs">10M</span>
              <span>10-Mark University Master Answer (Framework, Case & Evaluation)</span>
            </div>
            <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">Target: 10 Marks</span>
          </div>
          <div class="p-5 rounded-xl bg-purple-950/20 border border-purple-500/20 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line space-y-3">
            ${this.renderMarkdown(md.ten_mark_answer || '')}
          </div>
        </div>

        <!-- STRUCTURED COMPARISON TABLE -->
        ${compTable.headers && compTable.headers.length ? `
          <div class="glass-panel p-6 rounded-2xl border border-blue-500/20 space-y-3">
            <div class="flex items-center space-x-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
              <i data-lucide="table" class="w-4 h-4"></i>
              <span>High-Yield Comparison Table (Exam Evaluation)</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs text-slate-200 border-collapse">
                <thead>
                  <tr class="border-b border-white/10 bg-white/5">
                    ${compTable.headers.map(h => `<th class="p-3 font-bold text-white">${this.escapeHtml(h)}</th>`).join('')}
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  ${(compTable.rows || []).map(r => `
                    <tr class="hover:bg-white/[0.02]">
                      ${r.map((cell, cIdx) => `<td class="p-3 ${cIdx === 0 ? 'font-semibold text-cyan-300' : ''}">${this.escapeHtml(cell)}</td>`).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <!-- FREQUENTLY CONFUSED CONCEPTS & TRAPS -->
        <div class="glass-panel p-6 rounded-2xl border border-rose-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
            <i data-lucide="alert-octagon" class="w-4 h-4 text-rose-400"></i>
            <span>Frequently Confused Concepts & Examiner Traps</span>
          </div>
          <div class="space-y-2.5">
            ${(md.frequently_confused_concepts || []).map(fc => `
              <div class="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/20 text-xs sm:text-sm text-rose-200 leading-relaxed whitespace-pre-line">
                ${this.renderMarkdown(fc)}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- SHORT NOTES & MNEMONICS -->
        <div class="glass-panel p-6 rounded-2xl border border-emerald-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <i data-lucide="zap" class="w-4 h-4 text-emerald-400"></i>
            <span>Last-Minute Revision Mnemonics & Short Notes</span>
          </div>
          <div class="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20 space-y-2 text-xs sm:text-sm text-slate-200">
            ${mnemonics.mnemonic ? `<p class="font-bold text-emerald-300 text-sm">💡 Mnemonic: ${this.escapeHtml(mnemonics.mnemonic)}</p>` : ''}
            <ul class="space-y-1.5 text-slate-300 pt-1">
              ${(mnemonics.bullet_notes || []).map(bn => `<li class="flex items-start space-x-2"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5"></i><span>${this.escapeHtml(bn)}</span></li>`).join('')}
            </ul>
          </div>
        </div>

        <!-- PROBABLE EXAM QUESTIONS -->
        <div class="glass-panel p-6 rounded-2xl border border-amber-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <i data-lucide="help-circle" class="w-4 h-4 text-amber-400"></i>
            <span>Top Probable University Examination Questions</span>
          </div>
          <div class="space-y-2.5">
            ${(md.probable_exam_questions || []).map(q => `
              <div class="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs sm:text-sm text-amber-100 flex items-start space-x-2">
                <i data-lucide="arrow-right" class="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"></i>
                <span class="leading-relaxed">${this.escapeHtml(q)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // ==========================================
    // 5. TEACHING MODE 4: EXPERT (The Industry Specialist - 10 Parts)
    // ==========================================
    else if (mode === 'Expert') {
      html += `
        <!-- MODE HEADER -->
        <div class="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <span class="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 font-bold flex items-center justify-center text-sm">⚡</span>
            <div>
              <h4 class="text-sm font-bold text-white">Expert Mode: The Industry Specialist</h4>
              <p class="text-[11px] text-purple-300/80">First-principles axioms • Systems architecture • Production trade-offs & edge cases</p>
            </div>
          </div>
          <span class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-300 border border-purple-500/20">Staff-Level Architectural Depth</span>
        </div>

        <!-- PART 1: ADVANCED DEFINITION -->
        <div class="glass-panel p-6 rounded-2xl border border-blue-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center font-extrabold text-xs">1</span>
            <span>Advanced Architectural Definition</span>
          </div>
          <div class="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.advanced_definition || '')}
          </div>
        </div>

        <!-- PART 2: FIRST-PRINCIPLES FOUNDATION -->
        <div class="glass-panel p-6 rounded-2xl border border-indigo-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-extrabold text-xs">2</span>
            <span>First-Principles Foundation (Axioms)</span>
          </div>
          <div class="space-y-2">
            ${(md.first_principles || []).map(ax => `
              <div class="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-xs sm:text-sm text-indigo-100 flex items-start space-x-2.5">
                <i data-lucide="binary" class="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5"></i>
                <span class="leading-relaxed">${this.escapeHtml(ax)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- PART 3: TECHNICAL MECHANISM -->
        <div class="glass-panel p-6 rounded-2xl border border-cyan-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-extrabold text-xs">3</span>
            <span>Technical Mechanism & Data Flow</span>
          </div>
          <div class="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.technical_mechanism || '')}
          </div>
        </div>

        <!-- PART 4: SYSTEMS ARCHITECTURE DIAGRAM -->
        ${md.architecture_diagram ? `
          <div class="glass-panel p-6 rounded-2xl border border-cyan-500/20 space-y-3">
            <div class="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
              <span class="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-extrabold text-xs">4</span>
              <span>Systems Architecture & Operating Diagram</span>
            </div>
            <pre class="font-mono text-xs text-cyan-300 bg-black/60 p-4 rounded-xl border border-cyan-500/30 overflow-x-auto leading-relaxed">${this.escapeHtml(md.architecture_diagram)}</pre>
          </div>
        ` : ''}

        <!-- PART 5: ADVANCED INDUSTRY FRAMEWORKS -->
        <div class="glass-panel p-6 rounded-2xl border border-amber-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center font-extrabold text-xs">5</span>
            <span>Production-Grade Industry Frameworks</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            ${(md.advanced_frameworks || []).map(af => `
              <div class="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs sm:text-sm text-amber-100 flex items-start space-x-2">
                <i data-lucide="cpu" class="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"></i>
                <span>${this.escapeHtml(af)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- PART 6: PRODUCTION-GRADE INDUSTRY APPLICATION -->
        <div class="glass-panel p-6 rounded-2xl border border-emerald-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-extrabold text-xs">6</span>
            <span>Production-Grade Hyperscale Implementation</span>
          </div>
          <div class="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.industry_application || '')}
          </div>
        </div>

        <!-- PART 7: STRATEGIC & ARCHITECTURAL TRADE-OFFS -->
        <div class="glass-panel p-6 rounded-2xl border border-rose-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-rose-500/20 text-rose-300 flex items-center justify-center font-extrabold text-xs">7</span>
            <span>Strategic & Architectural Trade-offs</span>
          </div>
          <div class="space-y-2">
            ${(md.strategic_trade_offs || []).map(to => `
              <div class="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/20 text-xs sm:text-sm text-rose-200 flex items-start space-x-2">
                <i data-lucide="scale" class="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5"></i>
                <span class="leading-relaxed">${this.escapeHtml(to)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- PART 8: FAILURE MODES & RISK MITIGATION -->
        <div class="glass-panel p-6 rounded-2xl border border-amber-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center font-extrabold text-xs">8</span>
            <span>Failure Modes, Edge Cases & Runbooks</span>
          </div>
          <div class="space-y-2">
            ${(md.failure_modes_and_risks || []).map(fm => `
              <div class="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs sm:text-sm text-amber-200 leading-relaxed whitespace-pre-line">
                ⚠️ ${this.escapeHtml(fm)}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- PART 9: CRITICAL ANALYSIS -->
        <div class="glass-panel p-6 rounded-2xl border border-teal-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-teal-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center font-extrabold text-xs">9</span>
            <span>Critical Nuance & Analysis</span>
          </div>
          <div class="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
            ${this.renderMarkdown(md.critical_analysis || '')}
          </div>
        </div>

        <!-- PART 10: STAFF-LEVEL DEFENSE QUESTIONS -->
        <div class="glass-panel p-6 rounded-2xl border border-indigo-500/20 space-y-3">
          <div class="flex items-center space-x-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
            <span class="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-extrabold text-xs">10</span>
            <span>Staff / Principal Level Defense Questions</span>
          </div>
          <div class="space-y-2.5">
            ${(md.advanced_defense_questions || []).map((adq, aIdx) => `
              <div class="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 flex items-start space-x-2.5 text-xs sm:text-sm text-indigo-100">
                <span class="font-bold text-indigo-300 flex-shrink-0">Q${aIdx + 1}:</span>
                <span class="leading-relaxed">${this.escapeHtml(adq)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // ==========================================
    // 6. INTERACTIVE PRACTICAL BUSINESS CASE ENGINE WIDGET
    // ==========================================
    const bc = pkg.interactive_business_case;
    if (bc) {
      html += `
        <div id="business-case-card" class="glass-panel-elevated p-6 sm:p-8 rounded-3xl border border-blue-500/30 space-y-5 bg-gradient-to-br from-blue-950/20 to-indigo-950/20">
          <div class="flex items-center justify-between border-b border-white/10 pb-3">
            <div class="flex items-center space-x-2.5">
              <span class="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
                <i data-lucide="briefcase" class="w-4 h-4"></i>
              </span>
              <div>
                <h3 class="text-sm sm:text-base font-bold text-white">${this.escapeHtml(bc.title || 'Executive Decision Challenge')}</h3>
                <p class="text-[11px] text-slate-400">Company: ${this.escapeHtml(bc.company || 'Enterprise Leader')}</p>
              </div>
            </div>
            <span class="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">Interactive Simulation</span>
          </div>

          <div class="space-y-3 text-xs sm:text-sm text-slate-200">
            <p class="leading-relaxed"><strong class="text-white">Situation:</strong> ${this.escapeHtml(bc.situation || '')}</p>
            <div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 font-medium">
              ⚡ <strong>Executive Dilemma:</strong> ${this.escapeHtml(bc.dilemma || '')}
            </div>
          </div>

          <!-- Options -->
          <div class="space-y-2.5 pt-2">
            <span class="text-xs font-bold text-slate-300 uppercase tracking-wider">Choose Your Executive Action:</span>
            ${(bc.options || []).map(opt => `
              <button 
                onclick="App.selectBusinessCaseOption('${opt.id}')"
                data-opt-id="${opt.id}"
                class="bc-opt-btn w-full text-left p-3.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 transition flex items-start space-x-3"
              >
                <span class="w-6 h-6 rounded-full bg-white/10 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">${opt.id}</span>
                <div class="space-y-1">
                  <span class="font-bold text-white text-xs sm:text-sm block">${this.escapeHtml(opt.title)}</span>
                  <p class="text-xs text-slate-300 leading-relaxed">${this.escapeHtml(opt.description)}</p>
                </div>
              </button>
            `).join('')}
          </div>

          <!-- Revealable Professor Solution -->
          <div id="bc-professor-solution" class="hidden p-5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-3 animate-fade-in text-xs sm:text-sm">
            <div class="flex items-center space-x-2 text-emerald-300 font-bold text-xs uppercase tracking-wider">
              <i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i>
              <span>Professor Solution: Option ${this.escapeHtml(bc.recommended_option || 'B')} is Optimal</span>
            </div>
            <p class="text-slate-200 leading-relaxed">${this.escapeHtml(bc.professor_rationale || '')}</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
              <div class="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                <span class="font-bold text-amber-300">Managed Risks:</span>
                <p class="text-slate-300">${this.escapeHtml(bc.risks || '')}</p>
              </div>
              <div class="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                <span class="font-bold text-emerald-300">Expected Outcome:</span>
                <p class="text-slate-300">${this.escapeHtml(bc.expected_outcome || '')}</p>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // ==========================================
    // 7. SMART CONCEPT CONNECTIONS & PREREQUISITES
    // ==========================================
    const cc = pkg.concept_connections;
    if (cc && ((cc.prerequisites && cc.prerequisites.length) || (cc.related_concepts && cc.related_concepts.length))) {
      html += `
        <div class="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
          <div class="flex items-center space-x-2 text-slate-300 font-bold text-xs uppercase tracking-wider">
            <i data-lucide="git-merge" class="w-4 h-4 text-blue-400"></i>
            <span>Smart Concept Connections & Curriculum Roadmap</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <!-- Prerequisites -->
            <div class="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
              <span class="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center space-x-1.5">
                <i data-lucide="arrow-left-circle" class="w-3.5 h-3.5"></i>
                <span>Prerequisite Concepts:</span>
              </span>
              <div class="space-y-2">
                ${(cc.prerequisites || []).map(pre => `
                  <div class="p-2.5 rounded-lg bg-black/30 border border-white/5 flex items-center justify-between">
                    <div>
                      <span class="font-semibold text-white block">${this.escapeHtml(pre.concept_name)}</span>
                      <span class="text-[10px] text-slate-400">${this.escapeHtml(pre.reason)}</span>
                    </div>
                    <button 
                      onclick="App.selectConceptByName('${this.escapeHtml(pre.concept_name)}')"
                      class="px-2.5 py-1 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 text-[10px] font-bold transition flex-shrink-0 ml-2"
                    >
                      Review
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Related Concepts -->
            <div class="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
              <span class="text-[11px] font-bold uppercase tracking-wider text-cyan-300 flex items-center space-x-1.5">
                <i data-lucide="arrow-right-circle" class="w-3.5 h-3.5"></i>
                <span>Connected Concepts:</span>
              </span>
              <div class="space-y-2">
                ${(cc.related_concepts || []).map(rel => `
                  <div class="p-2.5 rounded-lg bg-black/30 border border-white/5 flex items-center justify-between">
                    <div>
                      <span class="font-semibold text-white block">${this.escapeHtml(rel.concept_name)}</span>
                      <span class="text-[10px] text-slate-400">${this.escapeHtml(rel.relationship)}</span>
                    </div>
                    <button 
                      onclick="App.selectConceptByName('${this.escapeHtml(rel.concept_name)}')"
                      class="px-2.5 py-1 rounded bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 text-[10px] font-bold transition flex-shrink-0 ml-2"
                    >
                      Explore
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
    this.initLucide();
  },

  selectBusinessCaseOption(optId) {
    document.querySelectorAll('.bc-opt-btn').forEach(btn => {
      const id = btn.getAttribute('data-opt-id');
      if (id === optId) {
        btn.className = 'bc-opt-btn w-full text-left p-3.5 rounded-xl border border-blue-500 bg-blue-500/20 text-white font-medium transition flex items-start space-x-3 shadow-md shadow-blue-500/10';
      } else {
        btn.className = 'bc-opt-btn w-full text-left p-3.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 transition flex items-start space-x-3';
      }
    });

    const solEl = document.getElementById('bc-professor-solution');
    if (solEl) {
      solEl.classList.remove('hidden');
    }
    this.initLucide();
  },

  async toggleFloatingChat(open) {
    const drawer = document.getElementById('floating-chatbot-drawer');
    if (!drawer) return;

    const shouldOpen = open !== undefined ? open : drawer.classList.contains('translate-x-full');

    if (shouldOpen) {
      drawer.classList.remove('translate-x-full');

      const sub = document.getElementById('floating-chat-context-sub');
      const conceptBadge = document.getElementById('fc-badge-concept');
      const slideBadge = document.getElementById('fc-badge-slide');
      const modeBadge = document.getElementById('fc-badge-mode');

      if (this.state.currentDocName && sub) {
        sub.innerText = `${this.state.currentDocName}`;
      }
      if (conceptBadge) conceptBadge.innerText = this.state.activeConceptName || 'Active Topic';
      if (slideBadge) slideBadge.innerText = `Slide ${this.state.currentSlideNumber || 1}`;
      if (modeBadge) modeBadge.innerText = `${this.state.teachingMode || 'MBA'} Mode`;

      if (this.state.currentDocId) {
        await this.loadPresentationChatHistory(this.state.currentDocId);
      }
      this.renderFloatingChatMessages();
    } else {
      drawer.classList.add('translate-x-full');
    }
  },

  renderFloatingChatMessages() {
    const container = document.getElementById('floating-chat-messages');
    if (!container) return;

    const msgs = this.state.chatMessages || [];
    if (msgs.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-slate-400 space-y-2">
          <div class="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 mx-auto flex items-center justify-center">
            <i data-lucide="bot" class="w-5 h-5"></i>
          </div>
          <p class="text-xs text-slate-300 font-semibold">Hello Vishal! I am your AI Professor.</p>
          <p class="text-[11px] text-slate-400 max-w-xs mx-auto">Ask any question about Slide ${this.state.currentSlideNumber || 1} or click the quick prompt chips above.</p>
        </div>
      `;
      this.initLucide();
      return;
    }

    container.innerHTML = msgs.map(m => {
      const isUser = m.role === 'user';
      return `
        <div class="flex items-start space-x-2.5 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}">
          <div class="w-7 h-7 rounded-lg ${isUser ? 'bg-blue-600 text-white' : 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'} flex items-center justify-center font-bold text-xs flex-shrink-0">
            ${isUser ? 'VS' : '<i data-lucide="bot" class="w-3.5 h-3.5"></i>'}
          </div>
          <div class="max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${isUser ? 'bg-blue-600 text-white shadow-sm' : 'glass-panel border border-white/10 text-slate-200'}">
            ${isUser ? this.escapeHtml(m.content) : this.renderMarkdown(m.content)}
            ${m.citation ? `<p class="mt-2 text-[10px] text-cyan-300/80 font-mono">${this.escapeHtml(m.citation)}</p>` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
    this.initLucide();
  },

  async handleFloatingChatSubmit(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('floating-chat-input');
    if (!input) return;
    const query = input.value.trim();
    if (!query) return;

    input.value = '';
    await this.sendFloatingChatQuery(query);
  },

  async sendFloatingChatPrompt(text) {
    await this.sendFloatingChatQuery(text);
  },

  async sendFloatingChatQuery(query) {
    if (!this.state.currentDocId) {
      this.showToast('Please open a presentation to chat with the professor', 'warning');
      return;
    }

    const thinking = document.getElementById('floating-chat-thinking');
    if (thinking) thinking.classList.remove('hidden');

    this.state.chatMessages = this.state.chatMessages || [];
    this.state.chatMessages.push({ role: 'user', content: query });
    this.renderFloatingChatMessages();

    try {
      const resp = await API.presentationTutorChat(
        this.state.currentDocId,
        query,
        this.state.activeConceptName || 'Overview',
        this.state.currentSlideNumber || 1,
        this.state.teachingMode || 'MBA',
        this.state.chatMessages
      );

      this.state.chatMessages.push({
        role: 'tutor',
        content: resp.reply,
        citation: resp.citation
      });

      this.renderFloatingChatMessages();
      this.renderChatMessages();
    } catch (err) {
      this.showToast(err.message || 'Chat error', 'error');
    } finally {
      if (thinking) thinking.classList.add('hidden');
    }
  },

  async handlePracticeQuestionAnswer(qIdx, selectedOptIdx, correctIdx, explanation) {
    const feedbackBox = document.getElementById(`practice-feedback-${qIdx}`);
    const btns = document.querySelectorAll(`.practice-opt-btn-${qIdx}`);

    btns.forEach(b => b.disabled = true);

    if (selectedOptIdx === correctIdx) {
      if (btns[selectedOptIdx]) {
        btns[selectedOptIdx].classList.add('bg-emerald-600/30', 'border-emerald-500', 'text-emerald-200');
      }
      if (feedbackBox) {
        feedbackBox.className = 'text-xs p-3.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-start space-x-2';
        feedbackBox.innerHTML = `
          <i data-lucide="check-circle-2" class="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400"></i>
          <div>
            <strong>Correct! Mastered this concept.</strong><br>
            ${this.escapeHtml(explanation)}
          </div>
        `;
      }
      if (this.state.currentDocId && this.state.activeConceptName) {
        await this.markCurrentConceptUnderstood();
      }
    } else {
      if (btns[selectedOptIdx]) {
        btns[selectedOptIdx].classList.add('bg-rose-600/30', 'border-rose-500', 'text-rose-200');
      }
      if (btns[correctIdx]) {
        btns[correctIdx].classList.add('bg-emerald-600/20', 'border-emerald-500/50', 'text-emerald-300');
      }
      if (feedbackBox) {
        feedbackBox.className = 'text-xs p-3.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-start space-x-2';
        feedbackBox.innerHTML = `
          <i data-lucide="alert-circle" class="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400"></i>
          <div>
            <strong>Not quite. Review the explanation:</strong><br>
            ${this.escapeHtml(explanation)}
          </div>
        `;
      }
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

    // Update Extracted Text Drawer
    const textNum = document.getElementById('ppt-text-panel-slide-num');
    const textContent = document.getElementById('ppt-extracted-text-content');
    if (textNum) textNum.innerText = slide.slide_number;
    if (textContent) {
      const paras = (slide.paragraphs || []).join('\n\n');
      const notes = slide.speaker_notes ? `\n\n[Speaker Notes]:\n${slide.speaker_notes}` : '';
      textContent.innerText = (paras || slide.title || 'No extracted text on this slide.') + notes;
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
    const stage = document.getElementById('ppt-viewer-stage') || document.getElementById('learn-tab-ppt-viewer');
    if (!stage) return;
    if (!document.fullscreenElement) {
      stage.requestFullscreen().catch(err => console.warn('Fullscreen err:', err));
    } else {
      document.exitFullscreen().catch(err => console.warn('Exit fullscreen err:', err));
    }
  },

  toggleExtractedTextPanel() {
    const panel = document.getElementById('ppt-extracted-text-panel');
    if (panel) {
      panel.classList.toggle('hidden');
      this.initLucide();
    }
  },

  async handleInDeckSearch(query) {
    const popover = document.getElementById('ppt-search-results-popover');
    if (!popover) return;
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      popover.classList.add('hidden');
      popover.innerHTML = '';
      return;
    }

    const slides = this.state.slidesData.slides || [];
    const matches = [];
    slides.forEach(s => {
      const text = ((s.title || '') + ' ' + (s.paragraphs || []).join(' ') + ' ' + (s.speaker_notes || '')).toLowerCase();
      if (text.includes(q)) {
        matches.push(s);
      }
    });

    if (matches.length === 0) {
      popover.innerHTML = `<div class="p-2.5 text-slate-400 italic text-center">No slides match "${this.escapeHtml(q)}"</div>`;
      popover.classList.remove('hidden');
      return;
    }

    popover.innerHTML = matches.map(m => `
      <div 
        onclick="App.jumpToSlideInViewer(${m.slide_number}); document.getElementById('ppt-search-results-popover').classList.add('hidden');" 
        class="p-2 rounded-lg bg-white/5 hover:bg-blue-600/30 cursor-pointer transition border border-white/5 flex items-center justify-between text-left"
      >
        <span class="font-bold text-blue-400 text-xs flex-shrink-0">Slide ${m.slide_number}</span>
        <span class="text-slate-300 truncate ml-2 text-[11px]">${this.escapeHtml(m.title || 'Slide ' + m.slide_number)}</span>
      </div>
    `).join('');
    popover.classList.remove('hidden');
  },

  openMoveDeckModal(docId) {
    const modal = document.getElementById('modal-move-deck');
    const input = document.getElementById('modal-move-doc-id');
    const select = document.getElementById('modal-move-subject-select');
    if (input) input.value = docId;
    if (select && this.state.subjects && this.state.subjects.length > 0) {
      select.innerHTML = this.state.subjects.map(s => `
        <option value="${s.id}" class="bg-[#131B2E] text-slate-100 py-1">${this.escapeHtml(s.name)}</option>
      `).join('');
    }
    if (modal) modal.classList.remove('hidden');
    this.initLucide();
  },

  async submitMoveDeck() {
    const docId = document.getElementById('modal-move-doc-id')?.value;
    const newSubId = document.getElementById('modal-move-subject-select')?.value;
    if (!docId || !newSubId) return;
    try {
      await API.updateDocument(docId, { subject_id: newSubId });
      this.closeModals();
      await this.loadSubjects();
      if (this.state.currentPage === 'subject' && this.state.currentSubject) {
        await this.loadSubject(this.state.currentSubject.id);
      } else {
        await this.loadDashboard();
      }
    } catch (e) {
      alert('Failed to move presentation: ' + e.message);
    }
  },

  async reprocessPresentation(docId) {
    if (!confirm('Reprocess this presentation? This will re-extract all slides, text, and regenerate concepts.')) return;
    try {
      await API.retryDocumentProcessing(docId);
      alert('Presentation reprocessed successfully!');
      if (this.state.currentPage === 'presentation-learn') {
        await this.loadPresentationLearning(docId);
      } else if (this.state.currentSubject) {
        await this.loadSubject(this.state.currentSubject.id);
      }
    } catch (e) {
      alert('Failed to reprocess: ' + e.message);
    }
  },

  async confirmDeleteSubject(subjectId) {
    const subj = (this.state.subjects || []).find(s => s.id === subjectId) || this.state.currentSubject;
    const name = subj ? subj.name : 'this subject';
    if (!confirm(`⚠️ Warning: Are you sure you want to permanently delete "${name}"?\n\nThis will permanently delete the subject and ALL associated presentations, extracted slides, quizzes, and notes. This cannot be undone.`)) {
      return;
    }
    try {
      await API.deleteSubject(subjectId);
      await this.loadSubjects();
      await this.navigate('dashboard');
    } catch (e) {
      alert('Failed to delete subject: ' + e.message);
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
      await this.loadConfidenceMatrix();

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
  selectCreateSubjectColor(color, btnEl) {
    const input = document.getElementById('modal-subject-color-input');
    if (input) input.value = color;
    const container = document.getElementById('create-subject-color-swatches');
    if (container) {
      container.querySelectorAll('button').forEach(b => {
        b.classList.remove('ring-2', 'ring-white', 'scale-110');
        b.classList.add('ring-0');
      });
    }
    if (btnEl) {
      btnEl.classList.remove('ring-0');
      btnEl.classList.add('ring-2', 'ring-white', 'scale-110');
    }
  },

  openCreateSubjectModal(preselectedSemester = null) {
    this.isCreatingSubject = false;
    const nameInput = document.getElementById('modal-subject-name-input');
    const descInput = document.getElementById('modal-subject-desc-input');
    const goalsInput = document.getElementById('modal-subject-goals-input');
    const semSelect = document.getElementById('modal-subject-semester-select');
    const catSelect = document.getElementById('modal-subject-category-select');
    const colorInput = document.getElementById('modal-subject-color-input');
    const err = document.getElementById('modal-subject-error');
    const btn = document.getElementById('modal-create-subject-btn');

    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    if (goalsInput) goalsInput.value = '';
    if (semSelect) {
      if (preselectedSemester && preselectedSemester.startsWith('Semester')) {
        semSelect.value = preselectedSemester;
      } else if (this.activeSemesterFilter && this.activeSemesterFilter.startsWith('Semester')) {
        semSelect.value = this.activeSemesterFilter;
      } else {
        semSelect.value = 'Semester 1';
      }
    }
    if (catSelect) catSelect.value = 'Product Management';
    if (colorInput) colorInput.value = '#3B82F6';

    if (err) {
      err.innerText = '';
      err.classList.add('hidden');
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>Create Subject</span>`;
    }

    const firstSwatch = document.querySelector('#create-subject-color-swatches button');
    if (firstSwatch) {
      this.selectCreateSubjectColor('#3B82F6', firstSwatch);
    }

    document.getElementById('modal-create-subject')?.classList.remove('hidden');
    nameInput?.focus();
  },

  async submitCreateSubject() {
    if (this.isCreatingSubject) return;

    const nameInput = document.getElementById('modal-subject-name-input');
    const descInput = document.getElementById('modal-subject-desc-input');
    const goalsInput = document.getElementById('modal-subject-goals-input');
    const semSelect = document.getElementById('modal-subject-semester-select');
    const catSelect = document.getElementById('modal-subject-category-select');
    const colorInput = document.getElementById('modal-subject-color-input');
    const err = document.getElementById('modal-subject-error');
    const btn = document.getElementById('modal-create-subject-btn');

    const name = nameInput ? nameInput.value.trim() : '';
    const desc = descInput ? descInput.value.trim() : '';
    const goals = goalsInput ? goalsInput.value.trim() : '';
    const semester = semSelect ? semSelect.value : 'Semester 1';
    const category = catSelect ? catSelect.value : 'Product Management';
    const color = colorInput ? colorInput.value : '#3B82F6';

    if (!name) {
      if (err) {
        err.innerText = 'Please enter a subject name.';
        err.classList.remove('hidden');
      }
      nameInput?.focus();
      return;
    }

    this.isCreatingSubject = true;
    if (err) err.classList.add('hidden');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="inline-block animate-spin mr-1.5">⏳</span><span>Creating...</span>`;
    }

    try {
      await API.createSubject({ name, description: desc, semester, category, goals, color });
      await this.loadSubjects();
      await this.loadDashboard();
      this.closeModals();
      if (nameInput) nameInput.value = '';
      if (descInput) descInput.value = '';
      if (goalsInput) goalsInput.value = '';
    } catch (e) {
      if (err) {
        err.innerText = e.message || 'Subject could not be created. Please try again.';
        err.classList.remove('hidden');
      }
    } finally {
      this.isCreatingSubject = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>Create Subject</span>`;
      }
    }
  },

  openRenameSubjectModal(id, currentName, currentDesc = '', currentSem = 'Semester 1', currentCat = 'Product Management', currentGoals = '') {
    const idInput = document.getElementById('modal-rename-subject-id');
    const nameInput = document.getElementById('modal-rename-subject-input');
    const descInput = document.getElementById('modal-rename-subject-desc-input');
    const semSelect = document.getElementById('modal-rename-subject-semester-select');
    const catSelect = document.getElementById('modal-rename-subject-category-select');
    const goalsInput = document.getElementById('modal-rename-subject-goals-input');
    const err = document.getElementById('modal-rename-subject-error');

    if (idInput) idInput.value = id;
    if (nameInput) nameInput.value = currentName || '';
    if (descInput) descInput.value = currentDesc || '';
    if (semSelect) semSelect.value = currentSem || 'Semester 1';
    if (catSelect) catSelect.value = currentCat || 'Product Management';
    if (goalsInput) goalsInput.value = currentGoals || '';
    if (err) err.classList.add('hidden');

    document.getElementById('modal-rename-subject')?.classList.remove('hidden');
    nameInput?.focus();
  },

  async submitRenameSubject() {
    const id = document.getElementById('modal-rename-subject-id')?.value;
    const name = document.getElementById('modal-rename-subject-input')?.value.trim();
    const desc = document.getElementById('modal-rename-subject-desc-input')?.value.trim();
    const semester = document.getElementById('modal-rename-subject-semester-select')?.value || 'Semester 1';
    const category = document.getElementById('modal-rename-subject-category-select')?.value || 'Product Management';
    const goals = document.getElementById('modal-rename-subject-goals-input')?.value.trim() || '';
    const err = document.getElementById('modal-rename-subject-error');
    const btn = document.getElementById('modal-rename-subject-btn');

    if (!name) {
      if (err) {
        err.innerText = 'Subject name cannot be empty.';
        err.classList.remove('hidden');
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Saving...';
    }

    try {
      await API.updateSubject(id, { name, description: desc, semester, category, goals });
      await this.loadSubjects();
      this.closeModals();
      if (this.state.currentPage === 'subject' && this.state.currentSubject?.id === id) {
        await this.loadSubject(id);
      } else {
        await this.loadDashboard();
      }
    } catch (e) {
      if (err) {
        err.innerText = e.message || 'Failed to update subject.';
        err.classList.remove('hidden');
      } else {
        alert(e.message || 'Failed to update subject');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Save Changes';
      }
    }
  },

  async confirmDeleteSubject(id, name) {
    const msg = `Are you sure you want to delete subject "${name}"?\n\n` +
      `WARNING: This will permanently delete:\n` +
      `• The subject record\n` +
      `• All associated PPT/PDF presentations\n` +
      `• All extracted slides and AI learning summaries\n` +
      `• All generated quizzes and doubt tickets\n\n` +
      `This action cannot be undone.`;
    if (!confirm(msg)) return;

    try {
      await API.deleteSubject(id);
      await this.loadSubjects();
      await this.loadDashboard();
      if (this.state.currentPage === 'subject') {
        this.navigate('dashboard');
      }
    } catch (e) {
      alert(e.message || 'Failed to delete subject');
    }
  },

  openProfileModal() {
    const subjects = this.state.subjects || [];
    const countSubjects = subjects.length;
    let countPresentations = 0;
    subjects.forEach(s => {
      countPresentations += (s.document_count !== undefined ? s.document_count : (s.documents ? s.documents.length : 0));
    });

    const subEl = document.getElementById('profile-stats-subjects');
    const presEl = document.getElementById('profile-stats-presentations');
    if (subEl) subEl.innerText = countSubjects;
    if (presEl) presEl.innerText = countPresentations;

    document.getElementById('modal-profile')?.classList.remove('hidden');
    this.initLucide();
  },

  async handleLogout() {
    if (!confirm('Are you sure you want to log out of VISHAL SINGH LMS?')) return;
    try {
      await API.logout();
    } catch (e) {
      console.warn('Logout notice:', e);
    }
    localStorage.removeItem('vishal_lms_token');
    sessionStorage.clear();
    window.location.reload();
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
    
    // Auto-detect target subject if preselected or currently inside subject workspace
    let targetSubjectId = preselectedSubjectId;
    if (!targetSubjectId && this.state.currentSubject && this.state.currentSubject.id) {
      targetSubjectId = this.state.currentSubject.id;
    }
    this.state.uploadTargetSubjectId = targetSubjectId;

    const fileInput = document.getElementById('modal-ppt-file-input');
    if (fileInput) fileInput.value = '';

    // Reset dropzone views
    const emptyView = document.getElementById('dropzone-empty-view');
    const selectedView = document.getElementById('dropzone-selected-view');
    if (emptyView) emptyView.classList.remove('hidden');
    if (selectedView) selectedView.classList.add('hidden');

    const dropzone = document.getElementById('upload-dropzone');
    if (dropzone) {
      dropzone.classList.remove('border-blue-500', 'bg-blue-500/10');
    }

    const updateSelect = () => {
      const select = document.getElementById('modal-upload-subject-select');
      const status = document.getElementById('modal-upload-subject-status');
      if (select) {
        if (this.state.subjects && this.state.subjects.length > 0) {
          if (status) status.innerText = `${this.state.subjects.length} subjects available`;
          const activeTarget = this.state.uploadTargetSubjectId;
          select.innerHTML = `
            <option value="" disabled ${!activeTarget ? 'selected' : ''} class="bg-[#131B2E] text-slate-400">Choose a subject to link presentation...</option>
            ${this.state.subjects.map(s => `
              <option value="${s.id}" class="bg-[#131B2E] text-slate-100 py-1" ${s.id === activeTarget ? 'selected' : ''}>${this.escapeHtml(s.name)}</option>
            `).join('')}
          `;
          if (activeTarget) {
            select.value = activeTarget;
          }
        } else {
          if (status) status.innerText = 'No subjects';
          select.innerHTML = `<option value="" disabled selected class="bg-[#131B2E] text-slate-400">No subjects available — Create a subject first</option>`;
        }
      }
      this.checkUploadButtonState();
    };

    updateSelect();

    const errorBox = document.getElementById('modal-upload-error-box');
    const errorText = document.getElementById('modal-upload-error');
    if (errorBox) errorBox.classList.add('hidden');
    if (errorText) errorText.innerText = '';

    // Ensure form view is visible and other states hidden
    document.getElementById('upload-stage-form')?.classList.remove('hidden');
    document.getElementById('upload-stage-form-footer')?.classList.remove('hidden');
    document.getElementById('upload-stage-processing')?.classList.add('hidden');
    document.getElementById('upload-stage-success')?.classList.add('hidden');
    document.getElementById('upload-modal-close-btn')?.classList.remove('hidden');

    document.getElementById('modal-upload-ppt')?.classList.remove('hidden');
    this.checkUploadButtonState();
    this.initLucide();

    if (!this.state.subjects || this.state.subjects.length === 0) {
      this.loadSubjects().then(() => updateSelect());
    }
  },

  handleUploadSubjectChange(subjectId) {
    this.state.uploadTargetSubjectId = subjectId || null;
    this.checkUploadButtonState();
  },

  checkUploadButtonState() {
    const submitBtn = document.getElementById('modal-upload-submit-btn');
    if (!submitBtn) return;

    const select = document.getElementById('modal-upload-subject-select');
    const selectedSubjectId = select ? select.value : this.state.uploadTargetSubjectId;
    const hasSubject = Boolean(selectedSubjectId && selectedSubjectId.trim() !== '');
    const hasFile = Boolean(this.state.selectedUploadFile);

    const isReady = hasSubject && hasFile;
    submitBtn.disabled = !isReady;

    if (isReady) {
      submitBtn.removeAttribute('title');
    } else if (!hasSubject && !hasFile) {
      submitBtn.setAttribute('title', 'Please choose a subject and select a presentation file');
    } else if (!hasSubject) {
      submitBtn.setAttribute('title', 'Please choose a subject to link presentation');
    } else if (!hasFile) {
      submitBtn.setAttribute('title', 'Please select a presentation file');
    }
  },

  openUploadPptForCurrentSubject() {
    const currentId = this.state.currentSubject?.id || null;
    this.openUploadPptModal(currentId);
  },

  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const dropzone = document.getElementById('upload-dropzone');
    if (dropzone) {
      dropzone.classList.add('border-blue-500', 'bg-blue-500/10');
    }
  },

  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const dropzone = document.getElementById('upload-dropzone');
    if (dropzone) {
      dropzone.classList.remove('border-blue-500', 'bg-blue-500/10');
    }
  },

  handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const dropzone = document.getElementById('upload-dropzone');
    if (dropzone) {
      dropzone.classList.remove('border-blue-500', 'bg-blue-500/10');
    }
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      this.handleFileSelected(e.dataTransfer.files[0]);
    }
  },

  handleFileSelected(file) {
    if (!file) return;
    const errorBox = document.getElementById('modal-upload-error-box');
    const errorText = document.getElementById('modal-upload-error');
    if (errorBox) errorBox.classList.add('hidden');
    if (errorText) errorText.innerText = '';

    const ext = file.name.split('.').pop().toLowerCase();
    const allowedExts = ['ppt', 'pptx', 'pdf', 'docx', 'doc', 'txt', 'md'];
    if (!allowedExts.includes(ext)) {
      if (errorBox && errorText) {
        errorText.innerText = 'Please select a valid presentation (.ppt, .pptx) or PDF (.pdf).';
        errorBox.classList.remove('hidden');
      } else {
        alert('Please select a valid presentation (.ppt, .pptx) or PDF (.pdf).');
      }
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      if (errorBox && errorText) {
        errorText.innerText = 'File size exceeds the 50 MB limit. Please select a smaller presentation.';
        errorBox.classList.remove('hidden');
      } else {
        alert('File size exceeds the 50 MB limit. Please select a smaller presentation.');
      }
      return;
    }

    this.state.selectedUploadFile = file;

    // Update dropzone view
    const emptyView = document.getElementById('dropzone-empty-view');
    const selectedView = document.getElementById('dropzone-selected-view');
    const nameEl = document.getElementById('selected-file-name');
    const sizeEl = document.getElementById('selected-file-size');

    if (emptyView) emptyView.classList.add('hidden');
    if (selectedView) selectedView.classList.remove('hidden');
    if (nameEl) nameEl.innerText = file.name;
    if (sizeEl) sizeEl.innerText = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

    this.checkUploadButtonState();
    this.initLucide();
  },

  clearSelectedUploadFile() {
    this.state.selectedUploadFile = null;
    const fileInput = document.getElementById('modal-ppt-file-input');
    if (fileInput) fileInput.value = '';

    const emptyView = document.getElementById('dropzone-empty-view');
    const selectedView = document.getElementById('dropzone-selected-view');
    if (emptyView) emptyView.classList.remove('hidden');
    if (selectedView) selectedView.classList.add('hidden');

    this.checkUploadButtonState();
  },

  async startUploadAndProcess() {
    const file = this.state.selectedUploadFile;
    if (!file) return;

    const select = document.getElementById('modal-upload-subject-select');
    const subjectId = (select && select.value) ? select.value : this.state.uploadTargetSubjectId;
    if (!subjectId) {
      const errorBox = document.getElementById('modal-upload-error-box');
      const errorText = document.getElementById('modal-upload-error');
      if (errorBox && errorText) {
        errorText.innerText = 'Please select a subject before uploading.';
        errorBox.classList.remove('hidden');
      }
      return;
    }

    const submitBtn = document.getElementById('modal-upload-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Processing...</span>
      `;
    }

    document.getElementById('upload-stage-form')?.classList.add('hidden');
    document.getElementById('upload-stage-form-footer')?.classList.add('hidden');
    document.getElementById('upload-stage-processing')?.classList.remove('hidden');
    document.getElementById('upload-modal-close-btn')?.classList.add('hidden');

    const filenameDisplay = document.getElementById('upload-processing-filename');
    if (filenameDisplay) filenameDisplay.innerText = file.name;

    const activateStage = async (stageNum, durationMs = 500) => {
      for (let i = 1; i < stageNum; i++) {
        const el = document.getElementById(`stage-step-${i}`);
        if (el) {
          el.className = 'stage-item completed';
          const ind = el.querySelector('.stage-indicator');
          if (ind) ind.innerHTML = '✓';
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
      formData.append('subject_id', subjectId);

      await activateStage(2, 500);

      const uploadResp = await API.uploadDocument(formData);
      const docId = uploadResp.id;
      this.state.newUploadedDocId = docId;

      await activateStage(3, 500);
      await activateStage(4, 600);

      try {
        const analyzePromise = API.analyzePresentation(docId);
        await activateStage(5, 700);
        await activateStage(6, 600);
        await analyzePromise;
      } catch (analyzeErr) {
        console.warn('Analysis completed or queued in background:', analyzeErr);
      }

      await activateStage(7, 400);

      for (let i = 1; i <= 7; i++) {
        const el = document.getElementById(`stage-step-${i}`);
        if (el) {
          el.className = 'stage-item completed';
          const ind = el.querySelector('.stage-indicator');
          if (ind) ind.innerHTML = '✓';
        }
      }

      await new Promise(r => setTimeout(r, 400));

      // Refresh data immediately
      await this.loadSubjects();
      await this.loadDashboard();
      if (subjectId) {
        await this.loadSubject(subjectId);
      }

      document.getElementById('upload-stage-processing')?.classList.add('hidden');
      document.getElementById('upload-stage-success')?.classList.remove('hidden');
      document.getElementById('upload-modal-close-btn')?.classList.remove('hidden');

      const meta = document.getElementById('upload-success-meta');
      if (meta) meta.innerText = `Processed ${uploadResp.slide_count || 1} slides into structured concepts.`;

    } catch (err) {
      console.error('Upload error:', err);
      document.getElementById('upload-stage-processing')?.classList.add('hidden');
      document.getElementById('upload-stage-form')?.classList.remove('hidden');
      document.getElementById('upload-stage-form-footer')?.classList.remove('hidden');
      document.getElementById('upload-modal-close-btn')?.classList.remove('hidden');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <i data-lucide="upload" class="w-4 h-4"></i>
          <span>Upload &amp; Process Presentation</span>
        `;
        this.initLucide();
      }

      const errorBox = document.getElementById('modal-upload-error-box');
      const errorText = document.getElementById('modal-upload-error');
      if (errorBox && errorText) {
        errorText.innerText = `Upload notice: ${err.message || 'Processing failed. Please try again.'}`;
        errorBox.classList.remove('hidden');
      } else {
        alert(`Upload notice: ${err.message || 'Processing failed'}`);
      }
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

  // ==================== 2X2 KNOWLEDGE MATRIX & METRICS ====================
  async loadConfidenceMatrix() {
    const container = document.getElementById('confidence-matrix-container');
    if (!container) return;
    container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 col-span-2">Analyzing calibration matrix...</div>`;

    try {
      const data = await API.getConfidenceMatrix();
      const m = data.matrix || {};
      const sum = data.summary || {};

      container.innerHTML = `
        <!-- Quadrant 1: Mastered -->
        <div class="matrix-quadrant p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-emerald-300 flex items-center space-x-1.5">
              <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-400"></i>
              <span>Mastered Concepts</span>
            </span>
            <span class="text-lg font-black text-emerald-400">${m.mastered || 0}</span>
          </div>
          <p class="text-[11px] text-slate-300 leading-snug">High Confidence + Correct. True conceptual mastery.</p>
        </div>

        <!-- Quadrant 2: Dangerous Blindspot -->
        <div class="matrix-quadrant p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-rose-300 flex items-center space-x-1.5">
              <i data-lucide="alert-triangle" class="w-4 h-4 text-rose-400"></i>
              <span>Dangerous Blindspots</span>
            </span>
            <span class="text-lg font-black text-rose-400">${m.dangerous_blindspot || 0}</span>
          </div>
          <p class="text-[11px] text-slate-300 leading-snug">High Confidence + Incorrect. High-risk misconceptions requiring urgent review.</p>
        </div>

        <!-- Quadrant 3: Shaky Ground -->
        <div class="matrix-quadrant p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-amber-300 flex items-center space-x-1.5">
              <i data-lucide="help-circle" class="w-4 h-4 text-amber-400"></i>
              <span>Lucky Guesses / Shaky</span>
            </span>
            <span class="text-lg font-black text-amber-400">${m.shaky_ground || 0}</span>
          </div>
          <p class="text-[11px] text-slate-300 leading-snug">Low Confidence + Correct. Right answer without complete certainty.</p>
        </div>

        <!-- Quadrant 4: Known Gaps -->
        <div class="matrix-quadrant p-5 rounded-2xl bg-slate-500/10 border border-slate-500/25 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
              <i data-lucide="book-open" class="w-4 h-4 text-slate-400"></i>
              <span>Recognized Knowledge Gaps</span>
            </span>
            <span class="text-lg font-black text-slate-300">${m.known_gap || 0}</span>
          </div>
          <p class="text-[11px] text-slate-300 leading-snug">Low Confidence + Incorrect. Acknowledged learning opportunities.</p>
        </div>

        <div class="col-span-1 sm:col-span-2 p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300 flex items-center justify-between">
          <span><strong>Calibration Advisory:</strong> ${this.escapeHtml(data.advisory)}</span>
          <span class="text-[11px] text-purple-400 font-semibold">${sum.mastered_pct || 0}% Mastered</span>
        </div>
      `;
      this.initLucide();
    } catch (e) {
      container.innerHTML = `<div class="p-4 text-xs text-rose-400 col-span-2">Notice: ${e.message}</div>`;
    }
  },

  // ==================== GLOBAL AI TUTOR (4 TEACHING MODES) ====================
  currentTeachingMode: 'MBA',
  isListening: false,

  async loadTutorPage() {
    this.currentTeachingMode = 'MBA';
    const subSelect = document.getElementById('tutor-subject-select');
    if (subSelect) {
      subSelect.innerHTML = `<option value="">All MBA Subjects (Cross-Subject)</option>` + 
        this.state.subjects.map(s => `<option value="${s.id}">${this.escapeHtml(s.name)}</option>`).join('');
    }
    await this.handleTutorSubjectChange('');
  },

  async handleTutorSubjectChange(subjectId) {
    const docSelect = document.getElementById('tutor-doc-select');
    if (!docSelect) return;
    try {
      const docs = await API.getDocuments(subjectId ? { subject_id: subjectId } : {});
      docSelect.innerHTML = `<option value="">All Uploaded Presentations</option>` +
        (docs || []).map(d => `<option value="${d.id}">${this.escapeHtml(d.name || d.original_filename)}</option>`).join('');
    } catch (e) {
      docSelect.innerHTML = `<option value="">All Uploaded Presentations</option>`;
    }
  },



  currentTutorAbortController: null,
  lastTutorQuery: '',

  stopTutorStream() {
    if (this.currentTutorAbortController) {
      this.currentTutorAbortController.abort();
      this.currentTutorAbortController = null;
      document.getElementById('tutor-stop-btn')?.classList.add('hidden');
    }
  },

  async handleTutorSend() {
    const input = document.getElementById('tutor-chat-input');
    if (!input) return;
    const query = input.value.trim();
    if (!query) return;
    input.value = '';
    this.lastTutorQuery = query;

    const container = document.getElementById('tutor-messages-container');
    if (!container) return;

    // Render User Bubble
    const userMsgHtml = `
      <div class="flex items-start justify-end gap-3 animate-fade-in">
        <div class="bg-blue-600 text-white rounded-2xl p-4 max-w-2xl text-xs shadow-md">
          ${this.escapeHtml(query)}
        </div>
        <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-700 flex items-center justify-center font-bold text-xs text-white shadow-md flex-shrink-0">
          VS
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', userMsgHtml);

    // Setup streaming AI bubble
    const msgId = `tutor-stream-${Date.now()}`;
    const aiMsgHtml = `
      <div id="${msgId}" class="flex items-start gap-3 animate-fade-in">
        <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-xs text-white shadow-md flex-shrink-0">
          AI
        </div>
        <div class="bg-white/5 border border-white/10 rounded-2xl p-4 max-w-2xl text-xs text-slate-200 leading-relaxed space-y-3 w-full">
          <div class="tutor-content-stream prose prose-invert prose-sm max-w-none text-slate-200">
            <span class="inline-block w-2 h-2 rounded-full bg-blue-400 animate-ping mr-2"></span>
            <span class="text-slate-400 italic">Thinking and synthesizing from course materials...</span>
          </div>
          <div class="tutor-citations-container hidden pt-2 border-t border-white/10 text-[11px] text-slate-400 space-y-1"></div>
          <div class="tutor-actions-bar hidden pt-2 border-t border-white/10 flex items-center space-x-2">
            <button onclick="App.copyTutorMessage('${msgId}')" class="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-[11px] flex items-center space-x-1" title="Copy response">
              <i data-lucide="copy" class="w-3.5 h-3.5"></i>
              <span>Copy</span>
            </button>
            <button onclick="App.regenerateTutorMessage()" class="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-[11px] flex items-center space-x-1" title="Regenerate">
              <i data-lucide="rotate-ccw" class="w-3.5 h-3.5 text-blue-400"></i>
              <span>Regenerate</span>
            </button>
            <button onclick="App.speakTutorMessage('${msgId}')" class="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-[11px] flex items-center space-x-1" title="Read aloud">
              <i data-lucide="volume-2" class="w-3.5 h-3.5 text-cyan-400"></i>
              <span>Listen</span>
            </button>
          </div>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', aiMsgHtml);
    this.initLucide();
    container.scrollTop = container.scrollHeight;

    const subId = document.getElementById('tutor-subject-select')?.value || null;
    const docId = document.getElementById('tutor-doc-select')?.value || null;
    const scope = document.getElementById('tutor-scope-select')?.value || 'all';

    const stopBtn = document.getElementById('tutor-stop-btn');
    if (stopBtn) stopBtn.classList.remove('hidden');

    this.currentTutorAbortController = new AbortController();
    let accumulatedText = '';
    const contentEl = document.querySelector(`#${msgId} .tutor-content-stream`);
    const citationsEl = document.querySelector(`#${msgId} .tutor-citations-container`);
    const actionsEl = document.querySelector(`#${msgId} .tutor-actions-bar`);

    await API.streamTutorChat(
      {
        query,
        mode: 'ask_materials',
        teaching_mode: this.currentTeachingMode || 'MBA',
        scope,
        subject_id: subId,
        document_id: docId
      },
      (chunk) => {
        accumulatedText += chunk;
        if (contentEl) {
          contentEl.innerHTML = window.marked ? window.marked.parse(accumulatedText) : accumulatedText.replace(/\n/g, '<br>');
        }
        container.scrollTop = container.scrollHeight;
      },
      (citations) => {
        if (stopBtn) stopBtn.classList.add('hidden');
        this.currentTutorAbortController = null;
        if (contentEl) {
          contentEl.innerHTML = window.marked ? window.marked.parse(accumulatedText) : accumulatedText.replace(/\n/g, '<br>');
        }
        if (citationsEl && citations && citations.length > 0) {
          citationsEl.innerHTML = `
            <span class="font-bold text-blue-400">📚 Source Citations:</span>
            <div class="flex flex-wrap gap-1.5">
              ${citations.map(c => `<span class="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">${this.escapeHtml(c.document)} (Slide ${c.slide})</span>`).join('')}
            </div>
          `;
          citationsEl.classList.remove('hidden');
        }
        if (actionsEl) actionsEl.classList.remove('hidden');
        this.initLucide();
        container.scrollTop = container.scrollHeight;
      },
      (err) => {
        if (stopBtn) stopBtn.classList.add('hidden');
        this.currentTutorAbortController = null;
        if (contentEl) {
          contentEl.innerHTML = `<span class="text-rose-400">Error: ${this.escapeHtml(err.message)}</span>`;
        }
      },
      this.currentTutorAbortController.signal
    );
  },

  copyTutorMessage(msgId) {
    const el = document.querySelector(`#${msgId} .tutor-content-stream`);
    if (el) {
      navigator.clipboard.writeText(el.innerText).then(() => alert('Copied response to clipboard!')).catch(() => {});
    }
  },

  regenerateTutorMessage() {
    if (this.lastTutorQuery) {
      const input = document.getElementById('tutor-chat-input');
      if (input) input.value = this.lastTutorQuery;
      this.handleTutorSend();
    }
  },

  speakTutorMessage(msgId) {
    const el = document.querySelector(`#${msgId} .tutor-content-stream`);
    if (el) this.speakText(el.innerText);
  },

  sendQuickTutorPrompt(promptText) {
    const input = document.getElementById('tutor-chat-input');
    if (input) {
      input.value = promptText;
      this.handleTutorSend();
    }
  },

  async clearTutorChat() {
    if (confirm('Clear all chat messages and history?')) {
      try {
        await API.clearTutorHistory();
      } catch (e) {}
      const container = document.getElementById('tutor-messages-container');
      if (container) {
        container.innerHTML = `
          <div class="flex items-start gap-3 animate-fade-in">
            <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-xs text-white shadow-md flex-shrink-0">AI</div>
            <div class="bg-white/5 border border-white/10 rounded-2xl p-4 max-w-2xl text-xs text-slate-200">
              <p class="font-semibold text-white">Chat cleared. What topic shall we master next, Vishal?</p>
            </div>
          </div>
        `;
      }
    }
  },

  toggleSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported by your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    const btn = document.getElementById('tutor-voice-btn');
    if (this.isListening) {
      this.isListening = false;
      btn?.classList.remove('voice-pulse', 'bg-rose-600', 'text-white');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      this.isListening = true;
      btn?.classList.add('voice-pulse', 'bg-rose-600', 'text-white');
    };

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      const input = document.getElementById('tutor-chat-input');
      if (input) {
        input.value = transcript;
        this.handleTutorSend();
      }
    };

    recognition.onerror = (e) => {
      console.warn('Speech error:', e);
      this.isListening = false;
      btn?.classList.remove('voice-pulse', 'bg-rose-600', 'text-white');
    };

    recognition.onend = () => {
      this.isListening = false;
      btn?.classList.remove('voice-pulse', 'bg-rose-600', 'text-white');
    };

    recognition.start();
  },

  speakText(text) {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported on this device.');
      return;
    }
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*#`_>-]/g, ' ');
    const utterance = new SpeechSynthesisUtterance(clean.substring(0, 500));
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  },

  // ==================== PRACTICE HUB (CASES, INTERVIEWS, MOCK EXAMS) ====================
  activePracticeTab: 'cases',

  async loadPracticePage() {
    this.switchPracticeTab(this.activePracticeTab);
    const mockSelect = document.getElementById('mock-subject-select');
    if (mockSelect) {
      mockSelect.innerHTML = this.state.subjects.map(s => `<option value="${s.id}">${this.escapeHtml(s.name)}</option>`).join('');
    }
  },

  switchPracticeTab(tab) {
    this.activePracticeTab = tab;
    document.querySelectorAll('.practice-tab-pill').forEach(btn => {
      if (btn.getAttribute('data-practice-tab') === tab) {
        btn.className = 'practice-tab-pill px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 shadow-sm transition';
      } else {
        btn.className = 'practice-tab-pill px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white transition';
      }
    });

    ['cases', 'interviews', 'mock-exams'].forEach(t => {
      const el = document.getElementById(`practice-tab-${t}`);
      if (el) el.classList.toggle('hidden', t !== tab);
    });

    if (tab === 'cases') this.loadCasesArchive();
    if (tab === 'interviews') this.loadInterviewsHistory();
  },

  async loadCasesArchive() {
    const list = document.getElementById('cases-archive-list');
    if (!list) return;
    try {
      const data = await API.getCases();
      const cases = data.cases || [];
      if (cases.length === 0) {
        list.innerHTML = `<p class="text-xs text-slate-400 italic">No business cases generated yet. Click 'Generate Case' above.</p>`;
        return;
      }
      list.innerHTML = cases.map(c => `
        <div class="glass-panel p-4 rounded-2xl flex items-center justify-between gap-4">
          <div class="space-y-1">
            <div class="flex items-center space-x-2">
              <span class="text-xs font-bold text-white">${this.escapeHtml(c.title)}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold">${c.role}</span>
            </div>
            <p class="text-[11px] text-slate-400">Industry: ${c.industry} • Status: ${c.status} • Score: <strong class="text-indigo-400">${c.score || 0}%</strong></p>
          </div>
          <button onclick="App.openCaseDetail('${c.id}')" class="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs border border-white/10">View Case</button>
        </div>
      `).join('');
    } catch (e) {
      list.innerHTML = `<p class="text-xs text-rose-400">Notice: ${e.message}</p>`;
    }
  },

  async generateNewCase() {
    const role = document.getElementById('case-role-select')?.value || 'Product Manager';
    const diff = document.getElementById('case-difficulty-select')?.value || 'Medium';

    const activeView = document.getElementById('active-case-view');
    if (!activeView) return;
    activeView.classList.remove('hidden');
    activeView.innerHTML = `<div class="glass-panel p-8 rounded-3xl text-center text-xs text-slate-300"><span class="w-3 h-3 rounded-full bg-indigo-500 animate-ping inline-block mr-2"></span> Synthesizing realistic ${role} case study...</div>`;

    try {
      const caseObj = await API.generateCase({ role, difficulty: diff });
      this.renderActiveCase(caseObj);
    } catch (e) {
      activeView.innerHTML = `<div class="p-4 rounded-2xl bg-rose-500/10 text-rose-300 text-xs">Error: ${e.message}</div>`;
    }
  },

  renderActiveCase(c) {
    const activeView = document.getElementById('active-case-view');
    if (!activeView) return;
    activeView.classList.remove('hidden');

    const d = c.case_data || {};
    const metricsHtml = (d.market_and_financial_data || []).map(m => `
      <div class="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
        <span class="text-[10px] text-slate-400 block">${m.metric}</span>
        <span class="text-sm font-extrabold text-white">${m.value}</span>
        <span class="text-[10px] text-indigo-400 font-semibold block">${m.trend}</span>
      </div>
    `).join('');

    const deliverablesHtml = (d.deliverables || []).map(dl => `<li class="text-xs text-slate-300 font-medium">${dl}</li>`).join('');

    activeView.innerHTML = `
      <div class="glass-panel p-6 sm:p-8 rounded-3xl space-y-6">
        <div class="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <span class="text-xs font-bold text-indigo-400 uppercase tracking-wider">${c.role} • ${c.industry}</span>
            <h3 class="text-xl font-extrabold text-white mt-1">${this.escapeHtml(d.title || c.title)}</h3>
          </div>
          <span class="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">${c.difficulty}</span>
        </div>

        <div class="space-y-3">
          <h4 class="text-xs font-bold text-white uppercase tracking-wider">Executive Scenario</h4>
          <p class="text-xs text-slate-300 leading-relaxed">${this.escapeHtml(d.executive_summary || '')}</p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          ${metricsHtml}
        </div>

        <div class="space-y-2">
          <h4 class="text-xs font-bold text-white uppercase tracking-wider">Expected Deliverables</h4>
          <ul class="list-disc pl-5 space-y-1">${deliverablesHtml}</ul>
        </div>

        <!-- Student Solution Area -->
        <div class="space-y-3 pt-4 border-t border-white/10">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold text-white uppercase tracking-wider">Your Executive Solution</h4>
            <span class="text-[11px] text-slate-400">Graded against 8 MBA rubrics</span>
          </div>
          <textarea 
            id="student-case-textarea"
            rows="6" 
            placeholder="Structure your answer: 1) Problem Framing & Diagnosis, 2) Strategic Prioritization & Tradeoffs, 3) Quantified Impact & Success Metrics..."
            class="w-full p-4 text-xs bg-white/5 border border-white/10 rounded-2xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          ></textarea>
          <div class="flex justify-end">
            <button onclick="App.submitCaseAttempt('${c.id}')" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md transition flex items-center space-x-2">
              <i data-lucide="check-square" class="w-4 h-4"></i>
              <span>Submit for Executive Evaluation</span>
            </button>
          </div>
        </div>

        <div id="case-evaluation-results" class="hidden space-y-4 pt-4 border-t border-white/10"></div>
      </div>
    `;
    this.initLucide();
  },

  async submitCaseAttempt(caseId) {
    const text = document.getElementById('student-case-textarea')?.value || '';
    if (!text.trim() || text.length < 30) {
      alert('Please provide a substantive answer (at least 30 characters) to evaluate against the 8 rubrics.');
      return;
    }

    const evalContainer = document.getElementById('case-evaluation-results');
    if (!evalContainer) return;
    evalContainer.classList.remove('hidden');
    evalContainer.innerHTML = `<div class="p-6 text-center text-xs text-slate-400"><span class="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping inline-block mr-2"></span> Executive faculty evaluating solution across 8 MBA rubrics...</div>`;

    try {
      const res = await API.submitCase(caseId, text);
      const ev = res.evaluation || {};

      const rubricsHtml = (ev.rubric_scores || []).map(r => `
        <div class="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-white">${r.rubric}</span>
            <span class="text-xs font-bold text-indigo-400">${r.score}/${r.max}</span>
          </div>
          <p class="text-[11px] text-slate-300 leading-tight">${r.comment}</p>
        </div>
      `).join('');

      evalContainer.innerHTML = `
        <div class="space-y-4 animate-fade-in">
          <div class="flex items-center justify-between p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30">
            <div>
              <span class="text-[10px] uppercase font-bold text-indigo-400">Overall Score</span>
              <h4 class="text-2xl font-black text-white">${res.score}%</h4>
            </div>
            <p class="text-xs text-slate-300 max-w-md">${this.escapeHtml(ev.executive_feedback || '')}</p>
          </div>

          <h5 class="text-xs font-bold text-white uppercase tracking-wider">Rubric Evaluation Breakdown</h5>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${rubricsHtml}</div>

          <div class="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
            <h5 class="text-xs font-bold text-cyan-400 uppercase tracking-wider">Benchmark 1% Model Answer</h5>
            <div class="text-xs text-slate-200 prose prose-invert prose-sm max-w-none">
              ${window.marked ? window.marked.parse(ev.model_answer || '') : this.escapeHtml(ev.model_answer || '')}
            </div>
          </div>
        </div>
      `;
      this.loadCasesArchive();
      this.initLucide();
    } catch (e) {
      evalContainer.innerHTML = `<div class="p-3 rounded-xl bg-rose-500/10 text-rose-300 text-xs">Error: ${e.message}</div>`;
    }
  },

  // ==================== REVISION HUB (SM-2 FLASHCARDS & DOUBTS) ====================
  activeRevisionTab: 'flashcards',
  flashcardsList: [],
  currentCardIndex: 0,
  isCardFlipped: false,

  async loadRevisionPage() {
    this.switchRevisionTab(this.activeRevisionTab);
  },

  switchRevisionTab(tab) {
    this.activeRevisionTab = tab;
    document.querySelectorAll('.revision-tab-pill').forEach(btn => {
      if (btn.getAttribute('data-revision-tab') === tab) {
        btn.className = 'revision-tab-pill px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-amber-600 shadow-sm transition';
      } else {
        btn.className = 'revision-tab-pill px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white transition';
      }
    });

    ['flashcards', 'doubts', 'prerequisites'].forEach(t => {
      const el = document.getElementById(`revision-tab-${t}`);
      if (el) el.classList.toggle('hidden', t !== tab);
    });

    if (tab === 'flashcards') this.loadFlashcards();
    if (tab === 'doubts') this.loadDoubts();
    if (tab === 'prerequisites') this.loadPrerequisiteGaps();
  },

  async loadFlashcards() {
    try {
      const dueData = await API.getDueFlashcards();
      const allData = await API.getAllFlashcards();
      this.flashcardsList = dueData.due_flashcards && dueData.due_flashcards.length > 0 ? dueData.due_flashcards : (allData.flashcards || []);
      this.currentCardIndex = 0;
      this.isCardFlipped = false;

      const dueBadge = document.getElementById('due-flashcards-badge');
      if (dueBadge) dueBadge.innerText = `Due Today: ${dueData.count || 0}`;
      const totalBadge = document.getElementById('total-flashcards-badge');
      if (totalBadge) totalBadge.innerText = `Total Cards: ${allData.count || 0}`;

      this.renderFlashcardPlayer();
    } catch (e) {
      console.warn('Flashcards load notice:', e);
    }
  },

  renderFlashcardPlayer() {
    const container = document.getElementById('flashcard-player-container');
    if (!container) return;

    if (!this.flashcardsList || this.flashcardsList.length === 0) {
      container.innerHTML = `
        <div class="glass-panel p-10 rounded-3xl text-center space-y-4">
          <i data-lucide="award" class="w-12 h-12 text-amber-400 mx-auto"></i>
          <h3 class="text-base font-bold text-white">All Caught Up!</h3>
          <p class="text-xs text-slate-400">Zero flashcards due right now. Open any uploaded presentation to auto-generate concept cards or add custom cards.</p>
        </div>
      `;
      this.initLucide();
      return;
    }

    const card = this.flashcardsList[this.currentCardIndex];
    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span>Card ${this.currentCardIndex + 1} of ${this.flashcardsList.length} • Concept: <strong class="text-slate-200">${this.escapeHtml(card.concept_name)}</strong></span>
          <span class="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-amber-300">Repetitions: ${card.repetitions || 0}</span>
        </div>

        <!-- 3D Flip Card Container -->
        <div class="flashcard-3d-scene w-full h-72">
          <div id="flashcard-card-inner" class="flashcard-inner ${this.isCardFlipped ? 'is-flipped' : ''}" onclick="App.flipCurrentCard()">
            <!-- Front Face -->
            <div class="flashcard-face glass-panel p-8 flex flex-col justify-between border-2 border-white/10 hover:border-amber-500/40 transition">
              <span class="text-[10px] uppercase font-bold text-slate-400 text-left">Front • Click anywhere to flip</span>
              <p class="text-base sm:text-lg font-bold text-white my-auto px-4">${this.escapeHtml(card.front)}</p>
              <div class="text-[11px] text-amber-400 font-semibold text-center flex items-center justify-center space-x-1">
                <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
                <span>Tap to reveal answer</span>
              </div>
            </div>

            <!-- Back Face -->
            <div class="flashcard-face flashcard-face-back glass-panel p-8 flex flex-col justify-between border-2 border-amber-500/50 bg-[#0E1626]">
              <span class="text-[10px] uppercase font-bold text-amber-400 text-left">Back • Strategic Explanation</span>
              <p class="text-xs sm:text-sm text-slate-200 my-auto px-4 leading-relaxed">${this.escapeHtml(card.back)}</p>
              <span class="text-[10px] text-slate-400">Rate your active recall below to calibrate SM-2 interval</span>
            </div>
          </div>
        </div>

        <!-- SM-2 Rating Buttons -->
        <div class="grid grid-cols-4 gap-2 pt-2">
          <button onclick="App.rateFlashcard('${card.id}', 0)" class="py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold text-xs border border-rose-500/30 transition flex flex-col items-center">
            <span>Again</span>
            <span class="text-[9px] font-normal text-rose-400 mt-0.5">Reset (1d)</span>
          </button>
          <button onclick="App.rateFlashcard('${card.id}', 1)" class="py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs border border-amber-500/30 transition flex flex-col items-center">
            <span>Difficult</span>
            <span class="text-[9px] font-normal text-amber-400 mt-0.5">Hard (1d)</span>
          </button>
          <button onclick="App.rateFlashcard('${card.id}', 2)" class="py-2.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-bold text-xs border border-blue-500/30 transition flex flex-col items-center">
            <span>Good</span>
            <span class="text-[9px] font-normal text-blue-400 mt-0.5">Optimal SM-2</span>
          </button>
          <button onclick="App.rateFlashcard('${card.id}', 3)" class="py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs border border-emerald-500/30 transition flex flex-col items-center">
            <span>Easy</span>
            <span class="text-[9px] font-normal text-emerald-400 mt-0.5">Bonus Interval</span>
          </button>
        </div>
      </div>
    `;
    this.initLucide();
  },

  flipCurrentCard() {
    this.isCardFlipped = !this.isCardFlipped;
    const inner = document.getElementById('flashcard-card-inner');
    if (inner) {
      inner.classList.toggle('is-flipped', this.isCardFlipped);
    }
  },

  async rateFlashcard(cardId, rating) {
    try {
      await API.reviewFlashcard(cardId, rating);
      this.isCardFlipped = false;
      this.currentCardIndex++;
      if (this.currentCardIndex >= this.flashcardsList.length) {
        await this.loadFlashcards();
      } else {
        this.renderFlashcardPlayer();
      }
    } catch (e) {
      alert(e.message || 'Review failed');
    }
  },

  // ==================== DOUBT NOTEBOOK ====================
  currentDoubtFilter: 'All',

  async loadDoubts() {
    const list = document.getElementById('doubts-list-container');
    if (!list) return;
    try {
      const data = await API.getDoubts({ status: this.currentDoubtFilter });
      const doubts = data.doubts || [];

      if (doubts.length === 0) {
        list.innerHTML = `<div class="glass-panel p-8 rounded-3xl text-center text-xs text-slate-400">No doubts recorded in this status.</div>`;
        return;
      }

      list.innerHTML = doubts.map(d => {
        const statusColors = {
          Unresolved: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          Understood: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          'Needs Revision': 'bg-amber-500/20 text-amber-300 border-amber-500/30'
        };
        const badge = statusColors[d.status] || 'bg-white/10 text-slate-300 border-white/10';

        return `
          <div class="glass-panel p-6 rounded-3xl space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="space-y-1">
                <div class="flex items-center space-x-2">
                  <h4 class="text-sm font-bold text-white">${this.escapeHtml(d.title)}</h4>
                  <span class="text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${badge}">${d.status}</span>
                </div>
                <p class="text-xs text-slate-400">Concept: ${this.escapeHtml(d.concept_name || 'General')} • Slide: ${d.slide_number || 1}</p>
              </div>

              <div class="flex items-center space-x-2">
                <select onchange="App.updateDoubtStatus('${d.id}', this.value)" class="px-2.5 py-1 text-xs bg-white/5 border border-white/10 rounded-xl text-slate-300">
                  <option value="Unresolved" ${d.status === 'Unresolved' ? 'selected' : ''}>Unresolved</option>
                  <option value="Needs Revision" ${d.status === 'Needs Revision' ? 'selected' : ''}>Needs Revision</option>
                  <option value="Understood" ${d.status === 'Understood' ? 'selected' : ''}>Understood</option>
                </select>
                <button onclick="App.convertDoubtToFlashcard('${d.id}')" class="px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/30" title="Convert to Flashcard">
                  To Card
                </button>
              </div>
            </div>

            <p class="text-xs text-slate-300 bg-white/[0.02] p-3 rounded-xl border border-white/5">
              <strong>Question:</strong> ${this.escapeHtml(d.doubt_text)}
            </p>

            ${d.ai_resolution ? `
              <div class="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-slate-200 leading-relaxed">
                <span class="font-bold text-blue-400 block mb-1">💡 AI Pedagogical Resolution:</span>
                ${window.marked ? window.marked.parse(d.ai_resolution) : this.escapeHtml(d.ai_resolution)}
              </div>
            ` : ''}

            <div class="flex justify-end pt-1">
              <button onclick="App.resolveDoubt('${d.id}')" class="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1">
                <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                <span>Ask AI to clarify further</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
      this.initLucide();
    } catch (e) {
      list.innerHTML = `<div class="p-4 text-xs text-rose-400">Error: ${e.message}</div>`;
    }
  },

  filterDoubts(status) {
    this.currentDoubtFilter = status;
    document.querySelectorAll('.doubt-filter-pill').forEach(btn => {
      const target = btn.getAttribute('data-doubt-filter');
      if (target === status) {
        btn.className = 'doubt-filter-pill px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white';
      } else {
        btn.className = 'doubt-filter-pill px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 text-slate-300';
      }
    });
    this.loadDoubts();
  },

  async updateDoubtStatus(doubtId, status) {
    try {
      await API.updateDoubtStatus(doubtId, status);
      this.loadDoubts();
    } catch (e) {
      alert(e.message || 'Status update failed');
    }
  },

  async convertDoubtToFlashcard(doubtId) {
    try {
      await API.convertDoubtToFlashcard(doubtId);
      alert('Successfully converted doubt into an active SM-2 flashcard!');
      this.loadDoubts();
    } catch (e) {
      alert(e.message || 'Conversion failed');
    }
  },

  async resolveDoubt(doubtId) {
    const prompt = window.prompt('Any specific clarification or example you want to focus on?');
    try {
      await API.resolveDoubtWithAI(doubtId, prompt || '');
      this.loadDoubts();
    } catch (e) {
      alert(e.message || 'AI resolution failed');
    }
  },

  openCreateDoubtModal() {
    const title = window.prompt('Doubt / Question Title:');
    if (!title) return;
    const body = window.prompt('Describe your doubt in detail:');
    if (!body) return;

    API.createDoubt({ title, doubt_text: body, auto_resolve: true })
      .then(() => this.loadDoubts())
      .catch(e => alert(e.message));
  },

  openCreateFlashcardModal() {
    const front = window.prompt('Front of card (Question or Key Term):');
    if (!front) return;
    const back = window.prompt('Back of card (Answer or Concept Breakdown):');
    if (!back) return;

    API.createFlashcard({ front, back, concept_name: 'Custom' })
      .then(() => this.loadFlashcards())
      .catch(e => alert(e.message));
  },

  // ==================== PREREQUISITE GAP DETECTOR ====================
  async loadPrerequisiteGaps() {
    const container = document.getElementById('prerequisite-gaps-container');
    if (!container) return;
    try {
      const data = await API.getPrerequisiteGaps();
      const gaps = data.gaps || [];

      container.innerHTML = gaps.map(g => `
        <div class="glass-panel p-6 rounded-3xl space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-bold text-white flex items-center space-x-2">
              <i data-lucide="alert-circle" class="w-4 h-4 text-cyan-400"></i>
              <span>Concept: ${this.escapeHtml(g.struggling_concept)}</span>
            </h4>
            <span class="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30">
              Mastery Score: ${g.recent_score}%
            </span>
          </div>

          <div class="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 space-y-1.5">
            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Identified Prerequisite Gaps:</span>
            <div class="flex flex-wrap gap-1.5">
              ${g.missing_prerequisites.map(p => `<span class="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold">${p}</span>`).join('')}
            </div>
          </div>

          <div class="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200">
            <strong>Diagnostic Check Question:</strong> ${this.escapeHtml(g.diagnostic_check)}
          </div>
        </div>
      `).join('');
      this.initLucide();
    } catch (e) {
      container.innerHTML = `<div class="p-4 text-xs text-rose-400">Error: ${e.message}</div>`;
    }
  },

  // ==================== MBA TOOLS (FRAMEWORKS & CALCULATORS) ====================
  activeMbaToolsTab: 'frameworks',
  currentCalculator: 'ltv-cac',
  frameworksList: [],

  async loadMbaToolsPage() {
    this.switchMbaToolsTab(this.activeMbaToolsTab);
  },

  switchMbaToolsTab(tab) {
    this.activeMbaToolsTab = tab;
    document.querySelectorAll('.mba-tab-pill').forEach(btn => {
      if (btn.getAttribute('data-mba-tools-tab') === tab) {
        btn.className = 'mba-tab-pill px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 shadow-sm transition';
      } else {
        btn.className = 'mba-tab-pill px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white transition';
      }
    });

    ['frameworks', 'calculators'].forEach(t => {
      const el = document.getElementById(`mba-tools-tab-${t}`);
      if (el) el.classList.toggle('hidden', t !== tab);
    });

    if (tab === 'frameworks') this.loadFrameworks();
    if (tab === 'calculators') this.selectCalculator(this.currentCalculator);
  },

  async loadFrameworks(category = '', search = '') {
    const grid = document.getElementById('frameworks-grid-container');
    if (!grid) return;
    try {
      const data = await API.getFrameworks(category, search);
      this.frameworksList = data.frameworks || [];

      grid.innerHTML = this.frameworksList.map(fw => `
        <div class="glass-panel p-6 rounded-3xl border border-white/10 hover:border-emerald-500/40 transition flex flex-col justify-between space-y-4">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">${fw.category}</span>
              <i data-lucide="compass" class="w-4 h-4 text-emerald-400"></i>
            </div>
            <h4 class="text-base font-bold text-white">${this.escapeHtml(fw.name)}</h4>
            <p class="text-xs text-slate-300 leading-snug">${this.escapeHtml(fw.tagline)}</p>
          </div>

          <div class="pt-3 border-t border-white/10 flex items-center justify-between">
            <span class="text-[11px] text-slate-400">${fw.components.length} Elements</span>
            <button onclick="App.openFrameworkDetail('${fw.id}')" class="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-emerald-300 hover:text-white text-xs font-semibold border border-white/10 transition">
              Explore & Notes
            </button>
          </div>
        </div>
      `).join('');
      this.initLucide();
    } catch (e) {
      grid.innerHTML = `<div class="p-4 text-xs text-rose-400 col-span-3">Notice: ${e.message}</div>`;
    }
  },

  filterFrameworks(query) {
    this.loadFrameworks('', query);
  },

  filterFrameworksCategory(category) {
    this.loadFrameworks(category === 'All' ? '' : category, '');
  },

  async openFrameworkDetail(fwId) {
    try {
      const fw = await API.getFrameworkDetail(fwId);
      const componentsHtml = (fw.components || []).map(c => `<li class="text-xs text-slate-200">${c}</li>`).join('');
      const noteVal = fw.user_notes || '';

      const modalHtml = `
        <div id="framework-detail-modal" class="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div class="glass-panel max-w-xl w-full p-6 sm:p-8 rounded-3xl space-y-5 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <span class="text-[10px] font-bold uppercase text-emerald-400">${fw.category}</span>
                <h3 class="text-xl font-bold text-white">${fw.name}</h3>
              </div>
              <button onclick="document.getElementById('framework-detail-modal').remove()" class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>

            <div class="space-y-2">
              <h4 class="text-xs font-bold text-white uppercase tracking-wider">Core Components</h4>
              <ul class="list-disc pl-5 space-y-1">${componentsHtml}</ul>
            </div>

            <div class="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-1">
              <span class="text-[11px] font-bold text-emerald-400 block">When to Use:</span>
              <p class="text-xs text-slate-300 leading-relaxed">${this.escapeHtml(fw.when_to_use)}</p>
            </div>

            <div class="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-1">
              <span class="text-[11px] font-bold text-cyan-400 block">Worked Example:</span>
              <p class="text-xs text-slate-300 leading-relaxed">${this.escapeHtml(fw.example)}</p>
            </div>

            <!-- Persistent Framework Notes -->
            <div class="space-y-2 pt-2 border-t border-white/10">
              <h4 class="text-xs font-bold text-white uppercase tracking-wider">Your Framework Study Notes</h4>
              <textarea id="framework-user-notes" rows="3" class="w-full p-3 text-xs bg-white/5 border border-white/10 rounded-xl text-slate-200 placeholder-slate-500">${this.escapeHtml(noteVal)}</textarea>
              <div class="flex justify-end">
                <button onclick="App.saveFrameworkNotes('${fw.id}')" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition">
                  Save Notes
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      this.initLucide();
    } catch (e) {
      alert(e.message);
    }
  },

  async saveFrameworkNotes(fwId) {
    const notes = document.getElementById('framework-user-notes')?.value || '';
    try {
      await API.saveFrameworkNotes(fwId, notes);
      alert('Framework notes saved successfully!');
      document.getElementById('framework-detail-modal')?.remove();
    } catch (e) {
      alert(e.message || 'Failed to save notes');
    }
  },

  // ==================== DETERMINISTIC QUANTITATIVE CALCULATORS ====================
  selectCalculator(calcId) {
    this.currentCalculator = calcId;
    document.querySelectorAll('.calc-sel-pill').forEach(btn => {
      if (btn.getAttribute('data-calc-btn') === calcId) {
        btn.className = 'calc-sel-pill px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white';
      } else {
        btn.className = 'calc-sel-pill px-3.5 py-1.5 rounded-xl text-xs font-medium bg-white/5 text-slate-300';
      }
    });
    this.renderSelectedCalculator(calcId);
  },

  renderSelectedCalculator(calcId) {
    const container = document.getElementById('calculator-panel-container');
    if (!container) return;

    if (calcId === 'ltv-cac') {
      container.innerHTML = `
        <div class="glass-panel p-6 sm:p-8 rounded-3xl space-y-6">
          <div class="pb-3 border-b border-white/10">
            <h3 class="text-base font-bold text-white">LTV:CAC Unit Economics Calculator</h3>
            <p class="text-xs text-slate-400">Formula: LTV = (ARPU × Gross Margin %) / Churn Rate • Target Ratio ≥ 3.0x</p>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">ARPU ($/month)</label>
              <input id="calc-arpu" type="number" value="120" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">Gross Margin (%)</label>
              <input id="calc-gm" type="number" value="80" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">Monthly Churn (%)</label>
              <input id="calc-churn" type="number" step="0.1" value="4.0" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">CAC ($)</label>
              <input id="calc-cac" type="number" value="600" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
            </div>
          </div>
          <button onclick="App.runLtvCacCalc()" class="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition">
            Compute Deterministic LTV:CAC
          </button>
          <div id="calc-results-output" class="space-y-3 pt-4 border-t border-white/10"></div>
        </div>
      `;
    } else if (calcId === 'npv') {
      container.innerHTML = `
        <div class="glass-panel p-6 sm:p-8 rounded-3xl space-y-6">
          <div class="pb-3 border-b border-white/10">
            <h3 class="text-base font-bold text-white">Net Present Value (NPV) & Payback Calculator</h3>
            <p class="text-xs text-slate-400">Formula: NPV = Σ [CF_t / (1 + r)^t] - C_0</p>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">Initial Outlay ($)</label>
              <input id="calc-npv-c0" type="number" value="100000" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">Discount Rate / WACC (%)</label>
              <input id="calc-npv-r" type="number" step="0.5" value="10.0" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
            </div>
          </div>
          <div>
            <label class="text-[11px] font-bold text-slate-400 block mb-1">Annual Cash Flows (Comma-separated, e.g. 35000, 45000, 50000)</label>
            <input id="calc-npv-flows" type="text" value="35000, 45000, 50000, 30000" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
          </div>
          <button onclick="App.runNpvCalc()" class="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition">
            Compute Deterministic NPV
          </button>
          <div id="calc-results-output" class="space-y-3 pt-4 border-t border-white/10"></div>
        </div>
      `;
    } else if (calcId === 'breakeven') {
      container.innerHTML = `
        <div class="glass-panel p-6 sm:p-8 rounded-3xl space-y-6">
          <div class="pb-3 border-b border-white/10">
            <h3 class="text-base font-bold text-white">Cost-Volume-Profit Break-Even Calculator</h3>
            <p class="text-xs text-slate-400">Formula: Break-even Units = Fixed Costs / (Price - Variable Cost)</p>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">Fixed Costs ($)</label>
              <input id="calc-be-fc" type="number" value="50000" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">Price per Unit ($)</label>
              <input id="calc-be-price" type="number" value="100" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">Variable Cost ($)</label>
              <input id="calc-be-vc" type="number" value="40" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
            </div>
          </div>
          <button onclick="App.runBreakevenCalc()" class="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition">
            Compute Break-Even Point
          </button>
          <div id="calc-results-output" class="space-y-3 pt-4 border-t border-white/10"></div>
        </div>
      `;
    } else {
      // General RICE / WACC / EOQ
      container.innerHTML = `
        <div class="glass-panel p-6 sm:p-8 rounded-3xl space-y-6">
          <div class="pb-3 border-b border-white/10">
            <h3 class="text-base font-bold text-white">RICE Product Prioritization Calculator</h3>
            <p class="text-xs text-slate-400">Formula: Score = (Reach × Impact × Confidence %) / Effort</p>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">Reach (Target users/qtr)</label>
              <input id="calc-rice-reach" type="number" value="10000" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">Impact Multiplier (0.25 to 3.0)</label>
              <input id="calc-rice-impact" type="number" step="0.5" value="2.0" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">Confidence (%)</label>
              <input id="calc-rice-conf" type="number" value="80" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">Effort (Person-weeks)</label>
              <input id="calc-rice-effort" type="number" value="4" class="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs">
            </div>
          </div>
          <button onclick="App.runRiceCalc()" class="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition">
            Compute RICE Prioritization Score
          </button>
          <div id="calc-results-output" class="space-y-3 pt-4 border-t border-white/10"></div>
        </div>
      `;
    }
  },

  async runLtvCacCalc() {
    const arpu = parseFloat(document.getElementById('calc-arpu')?.value || 120);
    const gm = parseFloat(document.getElementById('calc-gm')?.value || 80);
    const churn = parseFloat(document.getElementById('calc-churn')?.value || 4);
    const cac = parseFloat(document.getElementById('calc-cac')?.value || 600);

    const out = document.getElementById('calc-results-output');
    if (!out) return;

    try {
      const res = await API.calculateLtvCac({ arpu, gross_margin_pct: gm, monthly_churn_pct: churn, cac });
      out.innerHTML = `
        <div class="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3 animate-fade-in">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-[10px] text-slate-400 uppercase font-bold">LTV:CAC Ratio</span>
              <h4 class="text-3xl font-black text-emerald-400">${res.ltv_cac_ratio}x</h4>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-slate-400 uppercase font-bold">Customer LTV</span>
              <h4 class="text-xl font-bold text-white">$${res.ltv}</h4>
            </div>
          </div>
          <div class="text-xs text-slate-300">
            <strong>Strategic Assessment:</strong> ${res.health_status} — ${res.strategic_recommendation}
          </div>
          <div class="pt-2 border-t border-white/10 space-y-1">
            <span class="text-[10px] font-bold text-slate-400 uppercase">Calculation Steps:</span>
            ${res.calculation_steps.map(s => `<p class="text-[11px] text-slate-300">${s}</p>`).join('')}
          </div>
        </div>
      `;
    } catch (e) {
      out.innerHTML = `<div class="p-3 text-xs text-rose-400">${e.message}</div>`;
    }
  },

  async runNpvCalc() {
    const c0 = parseFloat(document.getElementById('calc-npv-c0')?.value || 100000);
    const r = parseFloat(document.getElementById('calc-npv-r')?.value || 10);
    const rawFlows = document.getElementById('calc-npv-flows')?.value || '';
    const flows = rawFlows.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));

    const out = document.getElementById('calc-results-output');
    if (!out) return;

    try {
      const res = await API.calculateNpv({ initial_investment: c0, discount_rate_pct: r, cash_flows: flows });
      out.innerHTML = `
        <div class="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3 animate-fade-in">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-[10px] text-slate-400 uppercase font-bold">Net Present Value (NPV)</span>
              <h4 class="text-3xl font-black ${res.npv >= 0 ? 'text-emerald-400' : 'text-rose-400'}">$${res.npv.toLocaleString()}</h4>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-slate-400 uppercase font-bold">Payback Period</span>
              <h4 class="text-lg font-bold text-white">${res.payback_years} Yrs</h4>
            </div>
          </div>
          <p class="text-xs text-slate-200"><strong>Recommendation:</strong> ${res.decision} — ${res.strategic_recommendation}</p>
        </div>
      `;
    } catch (e) {
      out.innerHTML = `<div class="p-3 text-xs text-rose-400">${e.message}</div>`;
    }
  },

  async runBreakevenCalc() {
    const fc = parseFloat(document.getElementById('calc-be-fc')?.value || 50000);
    const price = parseFloat(document.getElementById('calc-be-price')?.value || 100);
    const vc = parseFloat(document.getElementById('calc-be-vc')?.value || 40);

    const out = document.getElementById('calc-results-output');
    if (!out) return;

    try {
      const res = await API.calculateBreakeven({ fixed_costs: fc, selling_price_per_unit: price, variable_cost_per_unit: vc });
      out.innerHTML = `
        <div class="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3 animate-fade-in">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-[10px] text-slate-400 uppercase font-bold">Break-Even Units</span>
              <h4 class="text-3xl font-black text-emerald-400">${res.breakeven_units.toLocaleString()} Units</h4>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-slate-400 uppercase font-bold">Break-Even Revenue</span>
              <h4 class="text-xl font-bold text-white">$${res.breakeven_revenue.toLocaleString()}</h4>
            </div>
          </div>
          <p class="text-xs text-slate-200">${res.strategic_recommendation}</p>
        </div>
      `;
    } catch (e) {
      out.innerHTML = `<div class="p-3 text-xs text-rose-400">${e.message}</div>`;
    }
  },

  async runRiceCalc() {
    const reach = parseFloat(document.getElementById('calc-rice-reach')?.value || 10000);
    const impact = parseFloat(document.getElementById('calc-rice-impact')?.value || 2.0);
    const conf = parseFloat(document.getElementById('calc-rice-conf')?.value || 80);
    const effort = parseFloat(document.getElementById('calc-rice-effort')?.value || 4);

    const out = document.getElementById('calc-results-output');
    if (!out) return;

    try {
      const res = await API.calculateRice({ reach, impact, confidence_pct: conf, effort_person_weeks: effort });
      out.innerHTML = `
        <div class="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3 animate-fade-in">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-[10px] text-slate-400 uppercase font-bold">RICE Prioritization Score</span>
              <h4 class="text-3xl font-black text-emerald-400">${res.rice_score}</h4>
            </div>
          </div>
          <p class="text-xs text-slate-200">${res.strategic_recommendation}</p>
        </div>
      `;
    } catch (e) {
      out.innerHTML = `<div class="p-3 text-xs text-rose-400">${e.message}</div>`;
    }
  },

  // ==================== AI MASCOT (NOVA) ====================
  mascotTips: [
    "Tip: Use SM-2 Spaced Repetition flashcards daily to cement MBA terminology into long-term memory!",
    "Remember: In BCG matrix analysis, never reinvest Cash Cow profits into declining Dogs.",
    "Exam Strategy: Focus on high-confidence blindspots in your 2×2 calibration matrix before test day.",
    "Pro Tip: In case interviews, structure your hypothesis using the MECE framework before doing arithmetic.",
    "You have completed active study today! Keep up the momentum, Vishal."
  ],

  handleMascotClick() {
    this.toggleFloatingChat(true);
  },
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

window.App = App;

// Auto-boot reliably whether DOM is already parsed or still loading
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    App.init();
  });
} else {
  App.init();
}
