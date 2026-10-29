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
    currentSummary: null,
    currentSession: null,
    activeConceptIndex: 0,
    activeConceptName: '',
    selectedUploadFile: null,
    uploadTargetSubjectId: null,
    chatMessages: []
  },

  async init() {
    console.log('Initializing VISHAL SINGH LMS...');
    this.initTheme();
    this.initLucide();

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

  // ==================== ROUTING & NAVIGATION ====================
  async navigate(pageId, options = {}) {
    this.state.currentPage = pageId;

    // Update nav pills in header
    document.querySelectorAll('.nav-pill').forEach(el => {
      const target = el.getAttribute('data-nav-pill');
      if (target === pageId) {
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

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Page-specific loaders
    if (pageId === 'dashboard') {
      await this.loadDashboard();
    } else if (pageId === 'subject') {
      await this.loadSubject(options.subjectId);
    } else if (pageId === 'presentation-learn') {
      await this.loadPresentationLearning(options.docId);
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

      // Gradient color palettes for subject cards
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
                <!-- Top Row: Icon & Action Menu -->
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

                <!-- Subject Title & Description -->
                <h3 class="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                  ${this.escapeHtml(s.name)}
                </h3>
                <p class="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                  ${this.escapeHtml(desc)}
                </p>
              </div>

              <!-- Bottom Row: Presentation Count & Open Button -->
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

      // Update Header
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
                <!-- Top Status & Actions -->
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

                <!-- Presentation Title & Filename -->
                <h3 class="text-base font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-2">
                  ${this.escapeHtml(doc.name.replace(/\.pptx?$/i, ''))}
                </h3>
                <p class="text-[11px] text-slate-400 mt-1 truncate">
                  ${this.escapeHtml(doc.original_filename || doc.name)}
                </p>

                <!-- Meta Pills -->
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

              <!-- Action Button -->
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

  // ==================== 3. PRESENTATION LEARNING WORKSPACE (4 TABS) ====================
  async openPresentationLearning(docId) {
    await this.navigate('presentation-learn', { docId });
  },

  async loadPresentationLearning(docId) {
    try {
      this.state.currentDocId = docId;

      // Fetch summary and session
      const summary = await API.getPresentationSummary(docId);
      const session = await API.getPresentationSession(docId);
      this.state.currentSummary = summary;
      this.state.currentSession = session;

      // Update Top Bar
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

    this.initLucide();
  },

  // --- TAB 1: OVERVIEW RENDERER ---
  renderOverviewTab(overview, concepts) {
    const objEl = document.getElementById('overview-objective');
    const structEl = document.getElementById('overview-structure');
    if (objEl) objEl.innerText = overview.central_objective || 'Master core business concepts and strategic execution.';
    if (structEl) structEl.innerText = overview.structure || '';

    // Outcomes
    const outcomesContainer = document.getElementById('overview-learn-outcomes');
    if (outcomesContainer) {
      const outcomes = overview.what_will_learn || [
        'Master the foundational terminology and executive frameworks',
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

    // Concepts Badges
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

    // Section 1: Concept-by-Concept Breakdown
    html += `
      <div class="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 space-y-6">
        <h3 class="text-base font-bold text-white uppercase tracking-wider flex items-center space-x-2">
          <i data-lucide="book-open" class="w-5 h-5 text-blue-400"></i>
          <span>1. Concept-by-Concept Breakdown</span>
        </h3>
        <div class="space-y-5 divide-y divide-white/10">
    `;

    concepts.forEach(c => {
      const slides = c.slide_numbers ? c.slide_numbers.join(', ') : '1';
      html += `
        <div class="pt-5 first:pt-0 space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-base font-bold text-white">${this.escapeHtml(c.name)}</h4>
            <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">Slide ${slides}</span>
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
            <h4 class="text-sm font-bold text-white text-purple-300">${this.escapeHtml(fw.name)}</h4>
            <p class="text-xs text-slate-300"><strong>Why Used:</strong> ${this.escapeHtml(fw.why_used)}</p>
            <p class="text-xs text-slate-300"><strong>How It Works:</strong> ${this.escapeHtml(fw.how_works)}</p>
            <p class="text-xs text-slate-400"><strong>Example:</strong> ${this.escapeHtml(fw.step_by_step_example)}</p>
          </div>
        `;
      });
      html += `</div></div>`;
    }

    // Section 3: High-Yield Revision Sheet
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
      
      // Update Title & Badge
      const titleDisplay = document.getElementById('concept-title-display');
      const controlBadge = document.getElementById('concept-control-badge');
      const slideBadge = document.getElementById('concept-slide-badge');
      const citationTag = document.getElementById('concept-slide-citation-tag');
      const counterIndicator = document.getElementById('concept-counter-indicator');

      if (titleDisplay) titleDisplay.innerText = pkg.concept_name;
      if (controlBadge) controlBadge.innerText = pkg.control_title || 'Standard Explanation';
      if (slideBadge) slideBadge.innerText = `Slide ${pkg.slide_number}`;
      if (citationTag) citationTag.innerText = `Source: Slide ${pkg.slide_number}`;
      if (counterIndicator) counterIndicator.innerText = `${(pkg.concept_index || 0) + 1} of ${pkg.total_concepts || 1}`;

      // Update Session
      await API.updatePresentationSession(this.state.currentDocId, {
        current_concept_name: pkg.concept_name,
        current_slide_number: pkg.slide_number
      });

      // Render 8 Steps
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

        // Step 8: Comprehension Check
        const step8 = pkg.steps.find(s => s.step_number === 8);
        if (step8) {
          this.renderComprehensionCheck(step8);
        }
      }

      // External Authoritative References (Dual Knowledge)
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

      // Update progress in session
      if (this.state.currentDocId && this.state.activeConceptName) {
        await API.updatePresentationSession(this.state.currentDocId, {
          mark_understood: this.state.activeConceptName
        });
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
        // Tutor response (markdown parsed)
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

    // Append user query immediately
    this.state.chatMessages.push({ role: 'user', content: query });
    this.renderChatMessages();

    // Show thinking indicator
    const thinking = document.getElementById('chat-thinking-indicator');
    if (thinking) thinking.classList.remove('hidden');

    try {
      const docId = this.state.currentDocId;
      const conceptName = this.state.activeConceptName || 'Core Strategy';
      const resp = await API.presentationTutorChat(docId, query, conceptName, 1);

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

    // Reset Dropzone & Buttons
    const fileInput = document.getElementById('modal-ppt-file-input');
    if (fileInput) fileInput.value = '';
    const title = document.getElementById('dropzone-text-title');
    const subtitle = document.getElementById('dropzone-text-subtitle');
    if (title) title.innerText = 'Click to browse or drag and drop presentation';
    if (subtitle) subtitle.innerText = 'Accepts Microsoft PowerPoint (.ppt, .pptx)';
    
    const submitBtn = document.getElementById('modal-upload-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    // Populate Subject Selector Dropdown
    const select = document.getElementById('modal-upload-subject-select');
    if (select && this.state.subjects) {
      select.innerHTML = this.state.subjects.map(s => `
        <option value="${s.id}" ${s.id === preselectedSubjectId ? 'selected' : ''}>${this.escapeHtml(s.name)}</option>
      `).join('');
    }

    // Reset Modal Views
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

    // Switch view to 7-Stage Processing
    document.getElementById('upload-stage-form')?.classList.add('hidden');
    document.getElementById('upload-stage-processing')?.classList.remove('hidden');
    document.getElementById('upload-modal-close-btn')?.classList.add('hidden');

    const filenameDisplay = document.getElementById('upload-processing-filename');
    if (filenameDisplay) filenameDisplay.innerText = file.name;

    // Helper for stage transition
    const activateStage = async (stageNum, durationMs = 600) => {
      // Mark previous completed
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
      // Stage 1: Uploading
      await activateStage(1, 400);
      const formData = new FormData();
      formData.append('file', file);
      if (subjectId) formData.append('subject_id', subjectId);

      // Stage 2: Reading slides
      await activateStage(2, 500);

      // Upload and index
      const uploadResp = await API.uploadDocument(formData);
      const docId = uploadResp.id;
      this.state.newUploadedDocId = docId;

      // Stage 3: Extracting slide content
      await activateStage(3, 500);

      // Stage 4: Identifying key concepts
      await activateStage(4, 600);

      // Analyze presentation
      const analyzePromise = API.analyzePresentation(docId);

      // Stage 5: Creating detailed summary
      await activateStage(5, 700);

      // Stage 6: Preparing AI learning modules
      await activateStage(6, 600);
      await analyzePromise;

      // Stage 7: Finalizing study space
      await activateStage(7, 400);

      // Complete all
      for (let i = 1; i <= 7; i++) {
        const el = document.getElementById(`stage-step-${i}`);
        if (el) {
          el.className = 'stage-item completed';
          el.querySelector('.stage-indicator').innerHTML = '✓';
        }
      }

      await new Promise(r => setTimeout(r, 400));

      // Show Success Card
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
