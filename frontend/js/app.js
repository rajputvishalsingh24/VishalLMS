// VISHAL SINGH - AI Learning Platform
// Client Application Architecture
import { API } from './api.js';

export const App = {
  state: {
    currentPage: 'dashboard',
    stats: {},
    subjects: [],
    documents: [],
    currentDoc: null,
    currentSlideIndex: 0,
    tutorMode: 'ask_materials',
    tutorHistory: [],
    activeQuiz: null,
    quizQuestionIdx: 0,
    quizUserAnswers: {},
    notes: [],
    selectedNoteSubject: 'all',
    selectedNoteType: 'all',
    activeFlashcardIdx: 0,
    flashcardFlipped: false,
    selectedUploadFile: null,
    libraryFilters: {
      type: 'all',
      semester: 'all',
      sort: 'newest',
      search: ''
    }
  },

  async init() {
    console.log('Initializing VISHAL SINGH LMS...');
    this.initLucide();
    
    // Check authentication session
    const token = localStorage.getItem('vishal_lms_token');
    const isLoggedOut = localStorage.getItem('vishal_lms_logged_out') === 'true';
    if (isLoggedOut) {
      document.getElementById('modal-login')?.classList.remove('hidden');
    } else {
      try {
        const auth = await API.getCurrentUser(token);
        if (auth && auth.authenticated) {
          this.state.user = auth.user;
          const nameEl = document.getElementById('header-user-name');
          if (nameEl) nameEl.innerText = auth.user.full_name || 'Vishal Singh';
        }
      } catch (e) {
        console.warn('Auth check notice:', e);
      }
    }

    await this.loadSubjects();
    await this.loadDashboard();
    
    // Global keyboard listener for slide navigation
    document.addEventListener('keydown', (e) => {
      if (this.state.currentPage === 'viewer') {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') this.nextSlide();
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') this.prevSlide();
      }
    });

    window.App = this;
  },

  initLucide() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  // ==================== NAVIGATION ROUTER ====================
  async navigate(pageId, options = {}) {
    this.state.currentPage = pageId;

    // Toggle active sidebar item
    document.querySelectorAll('.nav-item').forEach(el => {
      if (el.getAttribute('data-nav') === pageId) {
        el.className = 'nav-item w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white bg-[#1C2541] shadow-xs';
      } else {
        el.className = 'nav-item w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-slate-300 hover:text-white hover:bg-slate-800/60';
      }
    });

    // Hide all pages, show target page
    document.querySelectorAll('.page-view').forEach(p => p.classList.add('hidden'));
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
      targetPage.classList.remove('hidden');
    }

    // Page specific initialization
    if (pageId === 'dashboard') await this.loadDashboard();
    else if (pageId === 'library') await this.loadLibrary();
    else if (pageId === 'viewer') await this.loadViewer(options.docId);
    else if (pageId === 'workspace') await this.loadWorkspace(options.docId);
    else if (pageId === 'tutor') await this.loadTutor(options);
    else if (pageId === 'quizzes') await this.loadQuizzes();
    else if (pageId === 'notes') await this.loadNotes();
    else if (pageId === 'progress') await this.loadProgress();
    else if (pageId === 'subjects') await this.loadSubjectsPage();
    else if (pageId === 'settings') await this.loadSettings();

    this.initLucide();
  },

  // ==================== 1. DASHBOARD ====================
  async loadDashboard() {
    try {
      const data = await API.getStats();
      this.state.stats = data.stats;

      // Check for active presentation to resume
      const resumeCard = document.getElementById('dashboard-resume-card');
      const activeDoc = (data.continue_learning && data.continue_learning[0]) || (data.recent_uploads && data.recent_uploads[0]);
      if (activeDoc && resumeCard) {
        resumeCard.classList.remove('hidden');
        const titleEl = document.getElementById('resume-card-title');
        const subEl = document.getElementById('resume-card-subtitle');
        if (titleEl) titleEl.innerText = `Resume Learning: ${activeDoc.name}`;
        if (subEl) subEl.innerText = `${activeDoc.subject_name || 'MBA Core'} • ${activeDoc.topic_name || 'Strategy Concepts'} • ${activeDoc.progress || 50}% Completed`;
        this.state.activePresentationId = activeDoc.id;
      }

      // Update stat counters
      document.getElementById('stat-presentations').innerText = data.stats.presentations;
      document.getElementById('stat-documents').innerText = data.stats.documents;
      document.getElementById('stat-subjects').innerText = data.stats.subjects;
      document.getElementById('stat-topics').innerText = data.stats.topics_completed;
      document.getElementById('stat-quizzes').innerText = data.stats.quizzes_attempted;
      document.getElementById('stat-progress-text').innerText = `${data.stats.overall_progress}%`;

      // Update progress donut ring
      const ring = document.getElementById('stat-progress-ring');
      if (ring) {
        ring.setAttribute('stroke-dasharray', `${data.stats.overall_progress}, 100`);
      }

      // Render Continue Learning Cards
      const continueContainer = document.getElementById('continue-learning-cards');
      if (data.continue_learning && data.continue_learning.length > 0) {
        continueContainer.innerHTML = data.continue_learning.map(item => `
          <div class="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-[11px] font-semibold px-2 py-0.5 rounded" style="background-color: ${item.subject_color}15; color: ${item.subject_color}">
                  ${item.subject_name || 'MBA Course'}
                </span>
                <span class="text-[11px] text-slate-400">Recent</span>
              </div>
              <h4 class="text-sm font-bold text-slate-900 leading-snug line-clamp-1 mb-1">${item.name}</h4>
              <p class="text-xs text-slate-500 mb-3">${item.topic_name || 'Core Concept'}</p>
            </div>

            <div>
              <div class="flex justify-between text-xs text-slate-600 mb-1">
                <span>Progress</span>
                <span class="font-bold">${item.progress || 50}%</span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-1.5 mb-3">
                <div class="bg-blue-600 h-1.5 rounded-full" style="width: ${item.progress || 50}%"></div>
              </div>
              <button onclick="App.navigate('viewer', { docId: '${item.id}' })" class="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition">
                Continue Learning
              </button>
            </div>
          </div>
        `).join('');
      } else {
        continueContainer.innerHTML = '<p class="text-xs text-slate-400 col-span-3">No active lessons. Start studying a presentation below.</p>';
      }

      // Render Recent Uploads Table
      const recentTbody = document.getElementById('recent-uploads-tbody');
      if (data.recent_uploads && data.recent_uploads.length > 0) {
        recentTbody.innerHTML = data.recent_uploads.map(doc => {
          const typeColor = doc.file_type === 'PPTX' || doc.file_type === 'PPT' ? 'bg-rose-50 text-rose-700' :
                           doc.file_type === 'PDF' ? 'bg-red-50 text-red-700' :
                           doc.file_type === 'DOCX' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700';
          const iconName = doc.file_type === 'PPTX' || doc.file_type === 'PPT' ? 'presentation' :
                           doc.file_type === 'PDF' ? 'file-text' : 'file';
          return `
            <tr class="hover:bg-slate-50/80 transition cursor-pointer" onclick="App.navigate('viewer', { docId: '${doc.id}' })">
              <td class="px-5 py-3 font-medium text-slate-900 flex items-center">
                <div class="w-7 h-7 rounded-lg ${typeColor} flex items-center justify-center mr-3">
                  <i data-lucide="${iconName}" class="w-3.5 h-3.5"></i>
                </div>
                <span class="truncate max-w-xs font-semibold">${doc.name}</span>
              </td>
              <td class="px-4 py-3 text-xs text-slate-600">${doc.subject_name || 'General'}</td>
              <td class="px-4 py-3 text-xs text-slate-400">${doc.created_at ? doc.created_at.split('T')[0] : 'Today'}</td>
              <td class="px-4 py-3">
                <span class="text-[10px] font-bold px-2 py-0.5 rounded ${typeColor}">${doc.file_type}</span>
              </td>
              <td class="px-4 py-3 text-right">
                <button onclick="event.stopPropagation(); App.navigate('viewer', { docId: '${doc.id}' })" class="text-xs font-semibold text-blue-600 hover:text-blue-700">Open</button>
              </td>
            </tr>
          `;
        }).join('');
      } else {
        recentTbody.innerHTML = '<tr><td colspan="5" class="px-5 py-4 text-center text-xs text-slate-400">No documents uploaded yet.</td></tr>';
      }

      this.initLucide();
    } catch (err) {
      console.error('Error loading dashboard:', err);
    }
  },

  // ==================== 2. STUDY LIBRARY ====================
  async loadLibrary() {
    try {
      const docs = await API.getDocuments(this.state.libraryFilters);
      this.state.documents = docs;

      // Update count
      const countEl = document.getElementById('library-file-count-label');
      if (countEl) countEl.innerText = `${docs.length} materials organized`;

      // Render Subject sidebar counts
      const subjectSidebar = document.getElementById('library-subjects-sidebar-list');
      if (subjectSidebar && this.state.subjects.length > 0) {
        subjectSidebar.innerHTML = `
          <div onclick="App.filterSubject('all')" class="p-1.5 rounded hover:bg-slate-100 flex justify-between cursor-pointer font-semibold text-blue-700">
            <span>All Subjects</span>
            <span class="text-slate-400">${docs.length}</span>
          </div>
        ` + this.state.subjects.map(s => `
          <div onclick="App.filterSubject('${s.id}')" class="p-1.5 rounded hover:bg-slate-100 flex justify-between cursor-pointer">
            <span class="truncate">${s.name}</span>
            <span class="text-slate-400">${s.document_count || 0}</span>
          </div>
        `).join('');
      }

      // Render Files Table
      const tbody = document.getElementById('library-files-tbody');
      if (docs.length > 0) {
        tbody.innerHTML = docs.map(doc => {
          const typeColor = doc.file_type === 'PPTX' || doc.file_type === 'PPT' ? 'bg-rose-50 text-rose-700' :
                           doc.file_type === 'PDF' ? 'bg-red-50 text-red-700' :
                           doc.file_type === 'DOCX' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700';
          const sizeKb = Math.round((doc.file_size || 0) / 1024);
          const sizeStr = sizeKb > 1024 ? `${(sizeKb/1024).toFixed(1)} MB` : `${sizeKb} KB`;

          return `
            <tr class="hover:bg-slate-50/80 transition cursor-pointer" onclick="App.navigate('viewer', { docId: '${doc.id}' })">
              <td class="px-5 py-3 font-medium text-slate-900 flex items-center">
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded mr-3 ${typeColor}">${doc.file_type}</span>
                <div>
                  <p class="font-bold text-slate-900 text-sm leading-tight">${doc.name}</p>
                  <p class="text-[11px] text-slate-400">${doc.slide_count || 1} slides / pages &bull; ${doc.faculty || 'MBA Faculty'}</p>
                </div>
              </td>
              <td class="px-4 py-3 text-xs text-slate-700 font-medium">${doc.subject_name || 'Product Management'}</td>
              <td class="px-4 py-3 text-xs text-slate-500">${doc.file_type}</td>
              <td class="px-4 py-3 text-xs text-slate-400">${sizeStr}</td>
              <td class="px-4 py-3 text-xs text-slate-400">${doc.created_at ? doc.created_at.split('T')[0] : 'Recent'}</td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end space-x-2" onclick="event.stopPropagation()">
                  <button onclick="App.navigate('viewer', { docId: '${doc.id}' })" class="px-2.5 py-1 bg-blue-50 text-blue-700 rounded text-xs font-semibold hover:bg-blue-100">Study</button>
                  <button onclick="App.deleteDoc('${doc.id}')" class="p-1 text-slate-400 hover:text-rose-600 rounded" title="Delete"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="6" class="px-5 py-6 text-center text-xs text-slate-400">No matching study materials found.</td></tr>';
      }

      this.initLucide();
    } catch (err) {
      console.error('Error loading library:', err);
    }
  },

  filterLibraryType(type) {
    this.state.libraryFilters.type = type;
    document.querySelectorAll('.type-filter-btn').forEach(btn => {
      if (btn.innerText.toLowerCase() === type || (type === 'all' && btn.innerText.includes('All'))) {
        btn.className = 'type-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white';
      } else {
        btn.className = 'type-filter-btn px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100';
      }
    });
    this.loadLibrary();
  },

  handleLibrarySearch(val) {
    this.state.libraryFilters.search = val;
    this.loadLibrary();
  },

  handleLibraryFilterChange() {
    const sem = document.getElementById('library-semester-filter').value;
    const sort = document.getElementById('library-sort-filter').value;
    this.state.libraryFilters.semester = sem;
    this.state.libraryFilters.sort = sort;
    this.loadLibrary();
  },

  filterSubject(subjId) {
    this.state.libraryFilters.subject_id = subjId;
    this.loadLibrary();
  },

  filterSemester(sem) {
    this.state.libraryFilters.semester = sem;
    document.getElementById('library-semester-filter').value = sem;
    this.loadLibrary();
  },

  async deleteDoc(docId) {
    if (!confirm('Are you sure you want to delete this study material and all its indexed slides?')) return;
    try {
      await API.deleteDocument(docId);
      await this.loadLibrary();
      await this.loadDashboard();
    } catch (err) {
      alert('Failed to delete document: ' + err.message);
    }
  },

  // ==================== 3. PRESENTATION VIEWER ====================
  async loadViewer(docId) {
    try {
      if (!docId) {
        // Fallback to first available document
        const docs = await API.getDocuments();
        if (docs.length > 0) docId = docs[0].id;
        else {
          alert('No documents available to view. Please upload study materials.');
          return this.navigate('library');
        }
      }

      const doc = await API.getDocument(docId);
      this.state.currentDoc = doc;
      this.state.currentSlideIndex = 0;

      // Update breadcrumbs
      document.getElementById('viewer-breadcrumb-subject').innerText = doc.subject_name || 'Product Management';
      document.getElementById('viewer-breadcrumb-doc').innerText = doc.name;

      // Render Thumbnails in left sidebar
      const thumbsList = document.getElementById('viewer-thumbnails-list');
      const chunks = doc.chunks || [];
      if (chunks.length > 0) {
        thumbsList.innerHTML = chunks.map((c, i) => `
          <div onclick="App.jumpToSlide(${i})" id="thumb-slide-${i}" class="slide-thumb p-2.5 rounded-lg border text-left cursor-pointer transition ${i === 0 ? 'border-blue-600 bg-blue-50/50 shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50'}">
            <div class="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1">
              <span>SLIDE ${c.slide_number || i + 1}</span>
              ${i === 0 ? '<span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span>' : ''}
            </div>
            <p class="text-xs font-semibold text-slate-800 line-clamp-2 leading-tight">${c.title || `Slide ${i+1}`}</p>
          </div>
        `).join('');
      } else {
        thumbsList.innerHTML = '<p class="text-xs text-slate-400">No slides parsed.</p>';
      }

      this.renderCurrentSlide();
      this.initLucide();
    } catch (err) {
      console.error('Error loading viewer:', err);
    }
  },

  renderCurrentSlide() {
    const doc = this.state.currentDoc;
    if (!doc || !doc.chunks || doc.chunks.length === 0) return;

    const idx = this.state.currentSlideIndex;
    const chunk = doc.chunks[idx];
    const total = doc.chunks.length;

    // Update Counter
    document.getElementById('viewer-slide-counter').innerText = `${idx + 1} / ${total}`;
    document.getElementById('slide-badge-number').innerText = `Slide ${idx + 1} of ${total}`;
    document.getElementById('slide-badge-topic').innerText = doc.topic_name || doc.subject_name || 'MBA Study Material';

    // Update Canvas Content
    document.getElementById('slide-canvas-title').innerText = chunk.title || `Slide ${idx + 1}`;
    document.getElementById('slide-canvas-subtitle').innerText = doc.name;

    // Extract bullet points
    const lines = (chunk.content || '').split('\n').filter(l => l.trim().length > 0);
    const bulletsContainer = document.getElementById('slide-canvas-body');
    if (lines.length > 0) {
      bulletsContainer.innerHTML = lines.slice(0, 5).map(line => `
        <div class="flex items-start space-x-2.5">
          <div class="w-2 h-2 rounded-full bg-blue-600 mt-1.5 flex-shrink-0"></div>
          <p class="text-slate-800 text-sm leading-relaxed">${line.replace(/^[•\-\*]\s*/, '')}</p>
        </div>
      `).join('');
    } else {
      bulletsContainer.innerHTML = '<p class="text-slate-500 italic">Slide visual overview and conceptual notes.</p>';
    }

    // Update Thumbnail Active Outline
    document.querySelectorAll('.slide-thumb').forEach((th, i) => {
      if (i === idx) {
        th.className = 'slide-thumb p-2.5 rounded-lg border text-left cursor-pointer transition border-blue-600 bg-blue-50/50 shadow-xs';
      } else {
        th.className = 'slide-thumb p-2.5 rounded-lg border text-left cursor-pointer transition border-slate-200 bg-white hover:bg-slate-50';
      }
    });

    // Update AI Summary Tab Takeaways
    const takeawaysList = document.getElementById('viewer-takeaways-list');
    const takeaways = chunk.takeaways || lines.slice(0, 3);
    if (takeaways.length > 0) {
      takeawaysList.innerHTML = takeaways.map(t => `
        <li class="flex items-start space-x-2">
          <span class="text-blue-600 font-bold">•</span>
          <span class="text-slate-700 leading-snug">${typeof t === 'string' ? t : t.text || 'Key takeaway'}</span>
        </li>
      `).join('');
    } else {
      takeawaysList.innerHTML = '<li class="text-slate-400">Review slide details above.</li>';
    }

    this.initLucide();
  },

  nextSlide() {
    if (!this.state.currentDoc) return;
    const total = this.state.currentDoc.chunks.length;
    if (this.state.currentSlideIndex < total - 1) {
      this.state.currentSlideIndex++;
      this.renderCurrentSlide();
    }
  },

  prevSlide() {
    if (this.state.currentSlideIndex > 0) {
      this.state.currentSlideIndex--;
      this.renderCurrentSlide();
    }
  },

  jumpToSlide(idx) {
    this.state.currentSlideIndex = idx;
    this.renderCurrentSlide();
  },

  switchViewerTab(tab) {
    ['summary', 'notes', 'ask_ai'].forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      const content = document.getElementById(`viewer-tab-${t}`);
      if (t === tab) {
        btn.className = 'flex-1 py-3 text-blue-600 border-b-2 border-blue-600 text-center font-bold';
        content.classList.remove('hidden');
      } else {
        btn.className = 'flex-1 py-3 text-slate-500 hover:text-slate-800 text-center';
        content.classList.add('hidden');
      }
    });
  },

  async askAIAboutThisSlide() {
    const doc = this.state.currentDoc;
    if (!doc) return;
    const chunk = doc.chunks[this.state.currentSlideIndex];
    const query = `Explain slide ${chunk.slide_number}: "${chunk.title}" from presentation ${doc.name} in simple terms with business examples.`;
    
    // Switch to Tutor page in presentation_explainer mode!
    await this.navigate('tutor', {
      query: query,
      mode: 'presentation_explainer',
      documentId: doc.id
    });
  },

  saveSlideNotes() {
    const text = document.getElementById('viewer-slide-personal-notes').value;
    if (!text.trim()) return;
    API.createNote({
      title: `Notes: ${this.state.currentDoc.name} (Slide ${this.state.currentSlideIndex + 1})`,
      subject_id: this.state.currentDoc.subject_id,
      note_type: 'quick_revision',
      content: text
    }).then(() => alert('Note saved to My Notes!'));
  },

  downloadCurrentDoc() {
    if (this.state.currentDoc) {
      alert(`Download started for ${this.state.currentDoc.name}`);
    }
  },

  // ==================== 4. AI TUTOR ====================
  async loadTutor(options = {}) {
    if (options.mode) {
      this.setTutorMode(options.mode);
    }
    if (options.query) {
      document.getElementById('tutor-input-field').value = options.query;
      await this.sendTutorMessage(options.documentId);
    }
  },

  setTutorMode(mode) {
    this.state.tutorMode = mode;
    document.querySelectorAll('.tutor-mode-btn').forEach(btn => {
      if (btn.getAttribute('data-tutor-mode') === mode) {
        btn.className = 'tutor-mode-btn px-3 py-1.5 rounded-lg bg-white text-blue-700 shadow-xs font-bold';
      } else {
        btn.className = 'tutor-mode-btn px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900';
      }
    });
  },

  sendTutorPrompt(promptText) {
    document.getElementById('tutor-input-field').value = promptText;
    this.sendTutorMessage();
  },

  async sendTutorMessage(docId = null) {
    const input = document.getElementById('tutor-input-field');
    const query = input.value.trim();
    if (!query) return;

    input.value = '';
    const chatContainer = document.getElementById('tutor-chat-container');

    // Append user query message
    chatContainer.innerHTML += `
      <div class="flex items-start justify-end space-x-3">
        <div class="bg-blue-600 text-white rounded-2xl rounded-tr-none px-4 py-3 max-w-2xl text-sm shadow-xs">
          ${query}
        </div>
        <div class="w-8 h-8 rounded-full bg-blue-700 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
          VS
        </div>
      </div>
    `;

    // Append loading bubble
    const loadingId = `loading-${Date.now()}`;
    chatContainer.innerHTML += `
      <div id="${loadingId}" class="flex items-start space-x-3">
        <div class="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
          <i data-lucide="bot" class="w-4 h-4"></i>
        </div>
        <div class="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-none p-4 text-xs text-slate-500 flex items-center space-x-2">
          <div class="w-2 h-2 rounded-full bg-blue-600 animate-ping"></div>
          <span>Consulting your MBA library slides and notes...</span>
        </div>
      </div>
    `;
    chatContainer.scrollTop = chatContainer.scrollHeight;
    this.initLucide();

    try {
      const res = await API.tutorChat(query, this.state.tutorMode, null, docId);
      
      // Remove loading indicator
      document.getElementById(loadingId)?.remove();

      // Render Markdown response with citations
      const parsedHtml = window.marked ? window.marked.parse(res.response) : res.response;
      
      let citationsHtml = '';
      if (res.citations && res.citations.length > 0) {
        citationsHtml = `
          <div class="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap gap-2 text-[11px]">
            <span class="font-bold text-slate-400 uppercase tracking-wider">Cited Sources:</span>
            ${res.citations.map(c => `
              <span class="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                ${c.document} &bull; Slide ${c.slide}
              </span>
            `).join('')}
          </div>
        `;
      }

      // Step by Step interactive controls if in mode 2
      let stepControlsHtml = '';
      if (this.state.tutorMode === 'teach_step_by_step') {
        stepControlsHtml = `
          <div class="mt-4 pt-3 border-t border-slate-200 flex flex-wrap gap-2">
            <button onclick="App.sendTutorPrompt('Explain this concept again with a simpler analogy.')" class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700">Explain Again</button>
            <button onclick="App.sendTutorPrompt('Give a real-world Product Management case example.')" class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700">Give PM Example</button>
            <button onclick="App.sendTutorPrompt('Move to next lesson step.')" class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white">Next Lesson Step &rarr;</button>
          </div>
        `;
      }

      chatContainer.innerHTML += `
        <div class="flex items-start space-x-3">
          <div class="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <i data-lucide="bot" class="w-4 h-4"></i>
          </div>
          <div class="bg-white border border-slate-200/90 rounded-2xl rounded-tl-none p-5 max-w-3xl text-sm text-slate-800 shadow-xs space-y-2">
            <div class="prose prose-sm max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-blue">
              ${parsedHtml}
            </div>
            ${citationsHtml}
            ${stepControlsHtml}
          </div>
        </div>
      `;

      chatContainer.scrollTop = chatContainer.scrollHeight;
      this.initLucide();
    } catch (err) {
      document.getElementById(loadingId)?.remove();
      chatContainer.innerHTML += `
        <div class="p-3 bg-red-50 text-red-700 rounded-xl text-xs">Error: ${err.message}</div>
      `;
    }
  },

  // ==================== 5. QUIZZES ====================
  async loadQuizzes() {
    try {
      const quiz = await API.generateQuiz({ difficulty: 'MBA Examination Level', num_questions: 5 });
      this.state.activeQuiz = quiz;
      this.state.quizQuestionIdx = 0;
      this.state.quizUserAnswers = {};
      this.renderQuizQuestion();
    } catch (err) {
      console.error('Error loading quiz:', err);
    }
  },

  renderQuizQuestion() {
    const qViewport = document.getElementById('quiz-active-viewport');
    const quiz = this.state.activeQuiz;
    if (!quiz || !quiz.questions || quiz.questions.length === 0) return;

    const idx = this.state.quizQuestionIdx;
    const q = quiz.questions[idx];
    const total = quiz.questions.length;
    const progressPct = Math.round(((idx + 1) / total) * 100);

    const letters = ['A', 'B', 'C', 'D'];

    qViewport.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6">
        <!-- Top Progress Header -->
        <div class="space-y-2">
          <div class="flex justify-between items-center text-xs font-semibold text-slate-500">
            <span>Question ${idx + 1} of ${total}</span>
            <span>${progressPct}%</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-2">
            <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: ${progressPct}%"></div>
          </div>
        </div>

        <!-- Question Prompt -->
        <div>
          <h3 class="text-lg font-bold text-slate-900 leading-snug">
            ${idx + 1}. ${q.question}
          </h3>
          <p class="text-xs text-slate-400 mt-1">${quiz.difficulty} &bull; ${q.source_citation || 'Product Management'}</p>
        </div>

        <!-- Options List -->
        <div class="space-y-3">
          ${q.options.map((opt, i) => {
            const letter = letters[i] || '•';
            const selected = this.state.quizUserAnswers[q.id] === opt;
            return `
              <div onclick="App.selectQuizOption(${q.id}, '${opt.replace(/'/g, "\\'")}')" class="quiz-option-card flex items-center p-3.5 rounded-xl border text-sm font-medium cursor-pointer transition ${selected ? 'border-blue-600 bg-blue-50/70 text-blue-900 font-semibold shadow-xs' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'}">
                <div class="w-7 h-7 rounded-lg mr-3 flex items-center justify-center font-bold text-xs ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}">
                  ${letter}
                </div>
                <span class="flex-1">${opt}</span>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Navigation Buttons -->
        <div class="flex items-center justify-between pt-4 border-t border-slate-100">
          <button onclick="App.prevQuizQuestion()" class="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 ${idx === 0 ? 'invisible' : ''}">
            &larr; Previous
          </button>
          ${idx < total - 1 ? `
            <button onclick="App.nextQuizQuestion()" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
              Next Question &rarr;
            </button>
          ` : `
            <button onclick="App.submitQuiz()" class="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
              Submit Answers & View Score &check;
            </button>
          `}
        </div>
      </div>
    `;

    this.initLucide();
  },

  selectQuizOption(qId, optionText) {
    this.state.quizUserAnswers[qId] = optionText;
    this.renderQuizQuestion();
  },

  nextQuizQuestion() {
    if (this.state.quizQuestionIdx < this.state.activeQuiz.questions.length - 1) {
      this.state.quizQuestionIdx++;
      this.renderQuizQuestion();
    }
  },

  prevQuizQuestion() {
    if (this.state.quizQuestionIdx > 0) {
      this.state.quizQuestionIdx--;
      this.renderQuizQuestion();
    }
  },

  async submitQuiz() {
    const answersList = Object.entries(this.state.quizUserAnswers).map(([qid, ans]) => ({
      question_id: parseInt(qid),
      selected_answer: ans
    }));

    try {
      const res = await API.submitQuiz(this.state.activeQuiz.id, answersList);
      this.renderQuizResults(res);
      await this.loadDashboard();
    } catch (err) {
      alert('Error submitting quiz: ' + err.message);
    }
  },

  renderQuizResults(res) {
    const qViewport = document.getElementById('quiz-active-viewport');
    qViewport.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-8 text-center space-y-6">
        <div class="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-2xl font-extrabold shadow-sm">
          ${res.accuracy}%
        </div>
        <div>
          <h3 class="text-2xl font-extrabold text-slate-900">Quiz Completed!</h3>
          <p class="text-sm text-slate-500 mt-1">You scored ${res.score} out of ${res.total} questions correctly.</p>
        </div>

        <div class="grid grid-cols-3 gap-3 max-w-md mx-auto text-center">
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span class="text-xs text-slate-400 font-medium">Total</span>
            <p class="text-lg font-bold text-slate-800">${res.total}</p>
          </div>
          <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
            <span class="text-xs text-emerald-600 font-medium">Correct</span>
            <p class="text-lg font-bold text-emerald-700">${res.correct_count}</p>
          </div>
          <div class="p-3 bg-rose-50 rounded-xl border border-rose-100">
            <span class="text-xs text-rose-600 font-medium">Incorrect</span>
            <p class="text-lg font-bold text-rose-700">${res.incorrect_count}</p>
          </div>
        </div>

        <!-- Answers Review Breakdown -->
        <div class="text-left space-y-4 pt-4 border-t border-slate-100">
          <h4 class="text-sm font-bold text-slate-900">Answers & Detailed Feedback</h4>
          ${res.results.map((r, i) => `
            <div class="p-4 rounded-xl border ${r.is_correct ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/40'} space-y-2 text-xs">
              <div class="flex items-center justify-between">
                <span class="font-bold ${r.is_correct ? 'text-emerald-800' : 'text-rose-800'}">Question ${i+1}: ${r.is_correct ? 'Correct' : 'Needs Review'}</span>
                <span class="text-slate-400">${r.source_citation}</span>
              </div>
              <p class="text-slate-800 font-semibold">${r.question}</p>
              <p class="text-slate-600">Your Answer: <span class="font-bold">${r.selected_answer || '(Unanswered)'}</span></p>
              ${!r.is_correct ? `<p class="text-emerald-700 font-bold">Correct Answer: ${r.correct_answer}</p>` : ''}
              <p class="text-slate-600 leading-relaxed">${r.explanation}</p>
            </div>
          `).join('')}
        </div>

        <div class="flex items-center justify-center space-x-3 pt-4">
          <button onclick="App.loadQuizzes()" class="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 shadow-sm">Take Another Quiz</button>
          <button onclick="App.navigate('dashboard')" class="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50">Back to Dashboard</button>
        </div>
      </div>
    `;
    this.initLucide();
  },

  // ==================== 6. MY NOTES ====================
  async loadNotes() {
    try {
      const notes = await API.getNotes(this.state.selectedNoteSubject, this.state.selectedNoteType);
      this.state.notes = notes;

      // Render Categories
      const catList = document.getElementById('notes-category-list');
      catList.innerHTML = `
        <div onclick="App.filterNotesSubject('all')" class="p-2 rounded-lg cursor-pointer flex justify-between font-semibold ${this.state.selectedNoteSubject === 'all' ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100 text-slate-700'}">
          <span>All Notes</span>
          <span class="text-slate-400">${notes.length}</span>
        </div>
      ` + this.state.subjects.map(s => `
        <div onclick="App.filterNotesSubject('${s.id}')" class="p-2 rounded-lg cursor-pointer flex justify-between ${this.state.selectedNoteSubject === s.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-slate-100 text-slate-700'}">
          <span class="truncate">${s.name}</span>
        </div>
      `).join('');

      // Render Notes List
      const container = document.getElementById('notes-content-container');
      if (notes.length > 0) {
        container.innerHTML = notes.map(n => `
          <div class="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                ${n.note_type.replace('_', ' ')}
              </span>
              <span class="text-xs text-slate-400">${n.subject_name || 'MBA Study'}</span>
            </div>
            <h4 class="text-base font-bold text-slate-900">${n.title}</h4>
            <div class="text-xs text-slate-700 whitespace-pre-line leading-relaxed border-t border-slate-100 pt-3">
              ${n.content}
            </div>
          </div>
        `).join('');
      } else {
        container.innerHTML = '<p class="text-xs text-slate-400 p-8 text-center bg-white rounded-xl border border-slate-200">No notes found for this category.</p>';
      }

      this.initLucide();
    } catch (err) {
      console.error('Error loading notes:', err);
    }
  },

  filterNotesSubject(subjId) {
    this.state.selectedNoteSubject = subjId;
    this.loadNotes();
  },

  async openGenerateNotesModal() {
    const title = prompt('Enter a topic to generate MBA revision notes for (e.g. Porter Five Forces, Product Lifecycle):', 'Product Lifecycle');
    if (!title) return;
    try {
      await API.generateNotes({ title, note_type: 'quick_revision' });
      await this.loadNotes();
      alert('AI Revision Notes successfully generated and saved!');
    } catch (err) {
      alert('Error generating note: ' + err.message);
    }
  },

  // ==================== 7. LEARNING PROGRESS ====================
  async loadProgress() {
    try {
      const data = await API.getProgress();
      const content = document.getElementById('progress-view-content');

      content.innerHTML = `
        <!-- Metrics Row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Study Streak</p>
              <p class="text-2xl font-extrabold text-slate-900 mt-1">${data.study_streak_days} Days 🔥</p>
            </div>
            <div class="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <i data-lucide="zap" class="w-5 h-5"></i>
            </div>
          </div>

          <div class="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Hours Studied</p>
              <p class="text-2xl font-extrabold text-slate-900 mt-1">${data.weekly_hours_studied} hrs</p>
            </div>
            <div class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <i data-lucide="clock" class="w-5 h-5"></i>
            </div>
          </div>

          <div class="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <p class="text-xs text-slate-400 font-semibold uppercase tracking-wider">Exam Readiness</p>
              <p class="text-2xl font-extrabold text-slate-900 mt-1">High (82%)</p>
            </div>
            <div class="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <i data-lucide="check-check" class="w-5 h-5"></i>
            </div>
          </div>
        </div>

        <!-- AI What Should I Learn Next? -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div class="flex items-center space-x-2">
            <i data-lucide="compass" class="w-5 h-5 text-blue-600"></i>
            <h3 class="text-base font-bold text-slate-900">What Should I Learn Next? (AI Recommendations)</h3>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${data.recommendations.map(r => `
              <div class="p-4 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-blue-50/40 hover:border-blue-200 transition space-y-2">
                <span class="text-[10px] font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded">${r.subject}</span>
                <h4 class="text-sm font-bold text-slate-900">${r.topic}</h4>
                <p class="text-xs text-slate-500 leading-relaxed">${r.reason}</p>
                <button onclick="App.navigate('tutor', { query: 'Teach me about ${r.topic}' })" class="text-xs font-bold text-blue-600 hover:text-blue-700 mt-2 block">
                  ${r.action} &rarr;
                </button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Subject Mastery Bars -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <h3 class="text-base font-bold text-slate-900">Subject Mastery Breakdown</h3>
          <div class="space-y-4">
            ${data.subject_progress.map(s => `
              <div>
                <div class="flex justify-between text-xs font-semibold mb-1">
                  <span class="text-slate-800">${s.name} (${s.semester})</span>
                  <span class="text-slate-500">${Math.round(s.avg_progress)}%</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-2">
                  <div class="h-2 rounded-full" style="width: ${Math.round(s.avg_progress)}%; background-color: ${s.color || '#2563EB'}"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      this.initLucide();
    } catch (err) {
      console.error('Error loading progress:', err);
    }
  },

  // ==================== 8. SUBJECTS & TOPICS ====================
  async loadSubjects() {
    this.state.subjects = await API.getSubjects();
    const sel = document.getElementById('upload-subject-select');
    if (sel && this.state.subjects.length > 0) {
      sel.innerHTML = this.state.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }
  },

  async loadSubjectsPage() {
    await this.loadSubjects();
    const grid = document.getElementById('subjects-cards-grid');
    if (!grid) return;

    grid.innerHTML = this.state.subjects.map(s => `
      <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:shadow-md transition">
        <div>
          <div class="flex items-center justify-between mb-3">
            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">${s.semester}</span>
            <span class="text-xs text-slate-400 font-medium">${s.document_count || 0} Files</span>
          </div>
          <h4 class="text-base font-bold text-slate-900 mb-1">${s.name}</h4>
          <p class="text-xs text-slate-500 line-clamp-2 mb-4">${s.description || 'Core curriculum subject'}</p>
        </div>

        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Topics (${(s.topics || []).length})</p>
          <div class="space-y-1.5 max-h-40 overflow-y-auto mb-4">
            ${(s.topics || []).map(t => `
              <div class="flex items-center justify-between text-xs p-1.5 rounded bg-slate-50 border border-slate-100">
                <span class="truncate font-medium text-slate-800">${t.name}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded ${t.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">${t.status}</span>
              </div>
            `).join('')}
          </div>

          <button onclick="App.navigate('library')" class="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition">
            View Study Materials
          </button>
        </div>
      </div>
    `).join('');

    this.initLucide();
  },

  // ==================== 9. SETTINGS ====================
  async loadSettings() {
    try {
      const s = await API.getSettings();
      const badge = document.getElementById('gemini-status-badge');
      if (s.has_gemini_api_key) {
        badge.innerText = `Connected (${s.masked_gemini_api_key})`;
        badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100';
      } else {
        badge.innerText = 'Built-in MBA Engine Active';
        badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100';
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  },

  async saveGeminiKey() {
    const key = document.getElementById('settings-gemini-key').value.trim();
    if (!key) return alert('Please enter an API key');
    try {
      await API.updateSettings({ gemini_api_key: key });
      alert('Gemini API key saved securely in persistent database!');
      await this.loadSettings();
    } catch (err) {
      alert('Failed to save key: ' + err.message);
    }
  },

  async resetToSampleData() {
    if (!confirm('Reset all materials, quizzes, and notes to the default MBA Masterclass curriculum?')) return;
    try {
      await API.resetSampleData();
      alert('Sample MBA curriculum restored successfully!');
      await this.loadSubjects();
      await this.navigate('dashboard');
    } catch (err) {
      alert('Reset failed: ' + err.message);
    }
  },

  // ==================== UPLOAD MODAL ====================
  openUploadModal() {
    document.getElementById('modal-upload').classList.remove('hidden');
    this.initLucide();
  },

  closeUploadModal() {
    document.getElementById('modal-upload').classList.add('hidden');
    this.state.selectedUploadFile = null;
    document.getElementById('upload-selected-file-label').innerText = '';
  },

  handleFileSelected(files) {
    if (!files || files.length === 0) return;
    this.state.selectedUploadFile = files[0];
    document.getElementById('upload-selected-file-label').innerText = `Selected: ${files[0].name} (${Math.round(files[0].size/1024)} KB)`;
  },

  toggleTag(pillEl) {
    if (pillEl.classList.contains('bg-blue-50')) {
      pillEl.className = 'upload-tag-pill px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 cursor-pointer';
    } else {
      pillEl.className = 'upload-tag-pill px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 cursor-pointer font-semibold';
    }
  },

  async submitDocumentUpload() {
    if (!this.state.selectedUploadFile) {
      alert('Please select a file to upload (PPT, PPTX, PDF, DOCX, TXT, MD)');
      return;
    }

    const btn = document.getElementById('upload-submit-btn');
    btn.disabled = true;
    btn.innerText = 'Extracting & Indexing...';

    const form = new FormData();
    form.append('file', this.state.selectedUploadFile);
    form.append('subject_id', document.getElementById('upload-subject-select').value);
    form.append('semester', document.getElementById('upload-semester-select').value);
    form.append('faculty', document.getElementById('upload-faculty-input').value);
    form.append('description', document.getElementById('upload-description-input').value);

    try {
      const file = this.state.selectedUploadFile;
      const res = await API.uploadDocument(form);
      this.closeUploadModal();
      const isPPT = file && (file.name.toLowerCase().endsWith('.ppt') || file.name.toLowerCase().endsWith('.pptx'));
      if (isPPT && res.doc_id) {
        await this.startPresentationAnalysis(res.doc_id, res.name || file.name);
      } else {
        alert(res.message || 'File uploaded and indexed successfully!');
        await this.loadDashboard();
        await this.loadLibrary();
      }
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerText = 'Upload';
    }
  },

  // ==================== AUTHENTICATION ====================
  async submitLogin() {
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value.trim();
    if (!u || !p) return alert('Please enter username and password');
    const btn = document.getElementById('login-submit-btn');
    btn.disabled = true;
    btn.innerText = 'Signing In...';
    try {
      const res = await API.login(u, p);
      localStorage.setItem('vishal_lms_token', res.token);
      localStorage.removeItem('vishal_lms_logged_out');
      this.state.user = res.user;
      document.getElementById('modal-login')?.classList.add('hidden');
      const nameEl = document.getElementById('header-user-name');
      if (nameEl) nameEl.innerText = res.user.full_name;
      await this.loadSubjects();
      await this.loadDashboard();
    } catch (err) {
      alert('Login error: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerText = 'Sign In';
    }
  },

  async handleLogout() {
    if (!confirm('Log out from your personal workspace?')) return;
    const token = localStorage.getItem('vishal_lms_token');
    await API.logout(token);
    localStorage.removeItem('vishal_lms_token');
    localStorage.setItem('vishal_lms_logged_out', 'true');
    document.getElementById('modal-login')?.classList.remove('hidden');
  },

  // ==================== QUIZ GENERATION MODAL ====================
  async openQuizGeneratorModal() {
    const sel = document.getElementById('quiz-gen-doc-select');
    if (sel) {
      if (this.state.documents.length === 0) {
        this.state.documents = await API.getDocuments();
      }
      sel.innerHTML = this.state.documents.map(d => `<option value="${d.id}">${d.name} (${d.subject_name || 'General'})</option>`).join('');
    }
    document.getElementById('modal-quiz-generator')?.classList.remove('hidden');
    this.initLucide();
  },

  async submitQuizGeneration() {
    const docId = document.getElementById('quiz-gen-doc-select').value;
    const diff = document.getElementById('quiz-gen-difficulty-select').value;
    const count = parseInt(document.getElementById('quiz-gen-count-select').value);
    const btn = document.getElementById('quiz-gen-submit-btn');
    btn.disabled = true;
    btn.innerText = 'Generating Quiz...';
    try {
      const quiz = await API.generateQuiz({ document_id: docId, difficulty: diff, num_questions: count });
      this.state.activeQuiz = quiz;
      this.state.quizQuestionIdx = 0;
      this.state.quizUserAnswers = {};
      document.getElementById('modal-quiz-generator')?.classList.add('hidden');
      await this.navigate('quizzes');
      this.renderQuizQuestion();
    } catch (err) {
      alert('Quiz generation error: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerText = 'Generate Quiz';
    }
  },

  // ==================== NOTES MODAL ====================
  openNewNoteModal() {
    const sel = document.getElementById('new-note-subject-select');
    if (sel && this.state.subjects.length > 0) {
      sel.innerHTML = this.state.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }
    document.getElementById('new-note-title').value = '';
    document.getElementById('new-note-content').value = '';
    document.getElementById('modal-new-note')?.classList.remove('hidden');
    this.initLucide();
  },

  async submitCreateNote() {
    const title = document.getElementById('new-note-title').value.trim();
    const subjId = document.getElementById('new-note-subject-select').value;
    const noteType = document.getElementById('new-note-type-select').value;
    const content = document.getElementById('new-note-content').value.trim();
    if (!title || !content) return alert('Please enter both title and content for your note');
    try {
      await API.createNote({ title, subject_id: subjId, note_type: noteType, content });
      document.getElementById('modal-new-note')?.classList.add('hidden');
      await this.loadNotes();
    } catch (err) {
      alert('Failed to save note: ' + err.message);
    }
  },

  // ==================== SUBJECTS MODAL ====================
  openAddSubjectModal() {
    document.getElementById('add-subject-name').value = '';
    document.getElementById('add-subject-description').value = '';
    document.getElementById('modal-add-subject')?.classList.remove('hidden');
    this.initLucide();
  },

  async submitAddSubject() {
    const name = document.getElementById('add-subject-name').value.trim();
    const semester = document.getElementById('add-subject-semester').value;
    const description = document.getElementById('add-subject-description').value.trim();
    if (!name) return alert('Please enter subject name');
    try {
      await API.createSubject({ name, semester, description, color: '#2563EB' });
      document.getElementById('modal-add-subject')?.classList.add('hidden');
      await this.loadSubjects();
      await this.loadSubjectsPage();
    } catch (err) {
      alert('Failed to create subject: ' + err.message);
    }
  },

  // ==================== DOC PICKER FOR TUTOR ====================
  async openDocPickerForTutor() {
    if (this.state.documents.length === 0) {
      this.state.documents = await API.getDocuments();
    }
    const list = document.getElementById('tutor-doc-picker-list');
    if (list) {
      list.innerHTML = this.state.documents.map(d => `
        <div onclick="App.attachDocToTutor('${d.id}', '${d.name.replace(/'/g, "\\'")}')" class="p-2.5 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-300 cursor-pointer flex items-center justify-between">
          <div>
            <p class="font-bold text-slate-900">${d.name}</p>
            <p class="text-[10px] text-slate-500">${d.subject_name || 'General'} &bull; ${d.slide_count || 1} slides/pages</p>
          </div>
          <span class="text-[10px] font-semibold text-blue-600">Select &rarr;</span>
        </div>
      `).join('');
    }
    document.getElementById('modal-doc-picker')?.classList.remove('hidden');
    this.initLucide();
  },

  attachDocToTutor(docId, docName) {
    document.getElementById('modal-doc-picker')?.classList.add('hidden');
    const input = document.getElementById('tutor-input-field');
    input.value = `Explain the key concepts in ${docName}: `;
    input.focus();
    this.state.attachedTutorDocId = docId;
  },

  // ==================== SLIDE VIEWER CHAT & FULLSCREEN ====================
  async sendSlideChatQuery() {
    const input = document.getElementById('viewer-slide-chat-input');
    const query = input.value.trim();
    if (!query || !this.state.currentDoc) return;
    input.value = '';
    const hist = document.getElementById('viewer-slide-chat-history');
    hist.innerHTML += `<div class="p-2 bg-blue-50 text-blue-900 rounded-lg text-xs font-medium"><strong>You:</strong> ${query}</div>`;
    const chunk = this.state.currentDoc.chunks[this.state.currentSlideIndex];
    const slideNum = chunk ? chunk.slide_number : (this.state.currentSlideIndex + 1);
    hist.innerHTML += `<div id="slide-chat-loading" class="text-slate-400 italic text-[11px] p-1">Consulting slide ${slideNum}...</div>`;
    hist.scrollTop = hist.scrollHeight;
    try {
      const res = await API.tutorChat(`Slide ${slideNum} ("${chunk ? chunk.title : ''}"): ${query}`, 'presentation_explainer', this.state.currentDoc.subject_id, this.state.currentDoc.id);
      document.getElementById('slide-chat-loading')?.remove();
      hist.innerHTML += `<div class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 leading-relaxed">${res.response.replace(/\n/g, '<br>')}</div>`;
      hist.scrollTop = hist.scrollHeight;
    } catch (err) {
      document.getElementById('slide-chat-loading')?.remove();
      hist.innerHTML += `<div class="text-red-500 text-xs p-1">Error: ${err.message}</div>`;
    }
  },

  toggleViewerFullscreen() {
    const v = document.getElementById('page-viewer');
    if (!document.fullscreenElement) {
      if (v.requestFullscreen) v.requestFullscreen();
      else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  },

  handleGlobalSearch(query) {
    if (!query.trim()) return;
    this.navigate('tutor', { query: query });
  },

  // ==================== PRESENTATION LEARNING WORKSPACE ENGINE ====================
  resumeCurrentPresentation() {
    const docId = this.state.activePresentationId || (this.state.documents && this.state.documents[0]?.id) || 'doc_ps';
    this.navigate('workspace', { docId });
  },

  async startPresentationAnalysis(docId, docName) {
    this.state.pendingAnalyzedDocId = docId;
    const modal = document.getElementById('modal-ppt-analysis');
    if (!modal) return;
    modal.classList.remove('hidden');

    const procState = document.getElementById('analysis-processing-state');
    const succState = document.getElementById('analysis-success-state');
    procState.classList.remove('hidden');
    succState.classList.add('hidden');

    const nameLabel = document.getElementById('analysis-doc-name-label');
    if (nameLabel) nameLabel.innerText = docName;

    // Reset stages
    for (let i = 1; i <= 5; i++) {
      const stage = document.getElementById(`stage-${i}`);
      if (stage) {
        stage.className = 'flex items-center space-x-3 text-slate-400';
        stage.querySelector('.stage-icon').className = 'stage-icon w-5 h-5 rounded-full border-2 border-slate-300 flex items-center justify-center text-[10px] font-bold';
        stage.querySelector('.stage-icon').innerText = i;
      }
    }

    const setStageActive = (num) => {
      const s = document.getElementById(`stage-${num}`);
      if (s) {
        s.className = 'flex items-center space-x-3 text-blue-600 font-bold';
        s.querySelector('.stage-icon').className = 'stage-icon w-5 h-5 rounded-full border-2 border-blue-600 bg-blue-50 flex items-center justify-center text-[10px] font-bold text-blue-600 animate-pulse';
      }
    };

    const setStageDone = (num) => {
      const s = document.getElementById(`stage-${num}`);
      if (s) {
        s.className = 'flex items-center space-x-3 text-emerald-600 font-semibold';
        s.querySelector('.stage-icon').className = 'stage-icon w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold';
        s.querySelector('.stage-icon').innerHTML = '✓';
      }
    };

    // Stage 1
    setStageActive(1);
    await new Promise(r => setTimeout(r, 600));
    setStageDone(1);

    // Stage 2
    setStageActive(2);
    await new Promise(r => setTimeout(r, 700));
    setStageDone(2);

    // Stage 3
    setStageActive(3);
    
    // Call backend API to analyze slides
    try {
      const res = await API.analyzePresentation(docId);
      setStageDone(3);

      // Stage 4
      setStageActive(4);
      await new Promise(r => setTimeout(r, 600));
      setStageDone(4);

      // Stage 5
      setStageActive(5);
      await new Promise(r => setTimeout(r, 600));
      setStageDone(5);

      // Show Success State
      await new Promise(r => setTimeout(r, 400));
      procState.classList.add('hidden');
      succState.classList.remove('hidden');

      const meta = document.getElementById('analysis-success-meta');
      if (meta && res.summary) {
        const slides = res.summary.overview?.total_slides || 12;
        const concepts = res.summary.concepts?.length || 8;
        const modules = res.summary.learning_path?.length || 3;
        meta.innerText = `${slides} slides processed • ${concepts} concepts identified • ${modules} learning modules ready`;
      }
      this.initLucide();
    } catch (err) {
      alert('Analysis completed with notice: ' + err.message);
      modal.classList.add('hidden');
      this.navigate('workspace', { docId });
    }
  },

  openAnalyzedWorkspace() {
    document.getElementById('modal-ppt-analysis')?.classList.add('hidden');
    const docId = this.state.pendingAnalyzedDocId || 'doc_ps';
    this.navigate('workspace', { docId });
  },

  async loadWorkspace(docId) {
    const targetDocId = docId || this.state.activePresentationId || 'doc_ps';
    this.state.currentDocId = targetDocId;

    try {
      // Parallel fetch: document details, summary, session, flashcards
      const [doc, summary, session, flashcards] = await Promise.all([
        API.getDocument(targetDocId),
        API.getPresentationSummary(targetDocId),
        API.getPresentationSession(targetDocId),
        API.getPresentationFlashcards(targetDocId)
      ]);

      this.state.currentDoc = doc;
      this.state.workspace = {
        doc,
        summary,
        session,
        flashcards,
        activeTab: 'summary',
        activeConceptName: session.current_concept_name || summary.concepts[0]?.name || '',
        activeSlideNumber: session.current_slide_number || 1,
        activeFlashcardIdx: 0,
        flashcardFlipped: false
      };

      // Header details
      document.getElementById('workspace-doc-title').innerText = doc.name || summary.title;
      document.getElementById('workspace-subject-badge').innerText = doc.subject_name || summary.overview?.subject || 'MBA Core';
      document.getElementById('workspace-slide-badge').innerText = `${doc.slide_count || summary.overview?.total_slides || 12} Slides`;
      
      // Update resume card
      const resumeCard = document.getElementById('dashboard-resume-card');
      if (resumeCard) {
        resumeCard.classList.remove('hidden');
        document.getElementById('resume-card-title').innerText = `Resume Learning: ${doc.name}`;
        document.getElementById('resume-card-subtitle').innerText = `Active Concept: ${this.state.workspace.activeConceptName} • Slide ${this.state.workspace.activeSlideNumber}`;
      }

      this.renderWorkspaceLeftPanel();
      this.renderDetailedSummary();
      this.renderWorkspaceSlide();
      this.renderFlashcardStage();
      this.renderWorkspaceExamQuestions();
      this.renderWorkspaceTutorMessages();

      // Load initial teaching package for active concept
      if (this.state.workspace.activeConceptName) {
        await this.selectWorkspaceConcept(this.state.workspace.activeConceptName, false);
      }

      this.switchWorkspaceTab('summary');
      this.initLucide();
    } catch (err) {
      console.error('Workspace load error:', err);
      alert('Error loading presentation workspace: ' + err.message);
    }
  },

  renderWorkspaceLeftPanel() {
    const ws = this.state.workspace;
    if (!ws || !ws.summary) return;

    const summary = ws.summary;
    const session = ws.session;
    const understood = session.understood_concepts || [];
    const totalConcepts = summary.concepts?.length || 1;
    const pct = Math.min(100, Math.round((understood.length / totalConcepts) * 100));

    document.getElementById('workspace-progress-pct').innerText = `${pct}%`;
    const bar = document.getElementById('workspace-progress-bar');
    if (bar) bar.style.width = `${pct}%`;

    // Render Learning Path Modules
    const treeEl = document.getElementById('workspace-modules-tree');
    if (treeEl && summary.learning_path) {
      treeEl.innerHTML = summary.learning_path.map((mod, modIdx) => {
        const conceptsHtml = (mod.concept_names || []).map(cName => {
          const isUnderstood = understood.includes(cName);
          const isRevision = (session.revision_needed_concepts || []).includes(cName);
          const isActive = ws.activeConceptName === cName;
          
          const icon = isUnderstood ? `<span class="text-emerald-500 font-bold">✓</span>` :
                       isRevision ? `<span class="text-amber-500 font-bold">⚑</span>` :
                       `<span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span>`;

          return `
            <div onclick="App.selectWorkspaceConcept('${cName.replace(/'/g, "\\'")}')" class="flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${isActive ? 'bg-blue-50 text-blue-800 font-bold border border-blue-200' : 'hover:bg-slate-50 text-slate-700'}">
              <div class="flex items-center space-x-2 truncate pr-1">
                <div class="w-4 flex items-center justify-center flex-shrink-0">${icon}</div>
                <span class="truncate">${cName}</span>
              </div>
              <i data-lucide="chevron-right" class="w-3 h-3 text-slate-400 flex-shrink-0"></i>
            </div>
          `;
        }).join('');

        return `
          <div class="border border-slate-100 rounded-xl p-2.5 bg-slate-50/60">
            <div class="flex items-center justify-between font-bold text-slate-800 text-[11px] mb-1.5">
              <span class="truncate pr-1">${mod.title}</span>
              <span class="text-[10px] text-slate-400 flex-shrink-0">${mod.estimated_minutes || 20}m</span>
            </div>
            <div class="space-y-1">
              ${conceptsHtml}
            </div>
          </div>
        `;
      }).join('');
    }

    // Slide Quick Jumps
    const thumbsEl = document.getElementById('workspace-slide-thumbnails');
    const totalSlides = ws.doc.slide_count || summary.overview?.total_slides || 12;
    if (thumbsEl) {
      let thumbsHtml = '';
      for (let s = 1; s <= totalSlides; s++) {
        const isActive = s === ws.activeSlideNumber;
        thumbsHtml += `
          <button onclick="App.jumpToWorkspaceSlide(${s})" class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition flex-shrink-0 ${isActive ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            ${s}
          </button>
        `;
      }
      thumbsEl.innerHTML = thumbsHtml;
    }
  },

  renderDetailedSummary() {
    const ws = this.state.workspace;
    if (!ws || !ws.summary) return;
    const s = ws.summary;
    const container = document.getElementById('summary-rendered-sections');
    if (!container) return;

    let html = `
      <!-- A. Presentation Overview -->
      <section id="sum-sec-overview" class="summary-section bg-gradient-to-br from-slate-50 to-blue-50/40 p-5 rounded-2xl border border-blue-100/80 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-extrabold uppercase tracking-wider text-blue-600 flex items-center">
            <i data-lucide="info" class="w-4 h-4 mr-1.5"></i> Section A: Presentation Overview
          </span>
          <span class="text-[11px] font-semibold text-slate-500">${s.overview?.total_slides || 12} Slides Grounded</span>
        </div>
        <h3 class="text-lg font-extrabold text-slate-900">${s.overview?.title || ws.doc.name}</h3>
        <p class="text-xs text-slate-700 leading-relaxed">${s.overview?.central_objective || 'Core MBA curriculum presentation.'}</p>
        
        <div class="pt-2">
          <p class="text-xs font-bold text-slate-800 mb-1.5">Key Learning Objectives:</p>
          <ul class="space-y-1 text-xs text-slate-600">
            ${(s.overview?.what_will_learn || []).map(item => `<li class="flex items-start"><span class="text-blue-500 font-bold mr-2">•</span>${item}</li>`).join('')}
          </ul>
        </div>
        <div class="text-[11px] text-slate-500 pt-1 border-t border-blue-100/60 font-medium">
          <strong>Structure:</strong> ${s.overview?.structure || 'Progresses from strategic foundations to execution mechanics.'}
        </div>
      </section>

      <!-- B. Concept-by-Concept Summary -->
      <section id="sum-sec-concepts" class="summary-section space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
          <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center">
            <i data-lucide="book-open" class="w-4 h-4 mr-1.5 text-blue-600"></i> Section B: Complete Concept-by-Concept Summary (${s.concepts?.length || 0})
          </h4>
        </div>
        <div class="space-y-3.5">
          ${(s.concepts || []).map((c, idx) => `
            <div class="summary-concept-card p-4 rounded-xl border border-slate-200/80 hover:border-blue-300 transition bg-white space-y-2.5">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="flex items-center space-x-2">
                    <span class="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Concept ${idx + 1}</span>
                    <span class="text-[10px] font-semibold text-slate-400">Slides ${c.slide_numbers ? c.slide_numbers.join(', ') : 1}</span>
                  </div>
                  <h5 class="text-sm font-extrabold text-slate-900 mt-0.5">${c.name}</h5>
                </div>
                <button onclick="App.selectWorkspaceConcept('${c.name.replace(/'/g, "\\'")}')" class="px-3 py-1 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 rounded-lg text-xs font-bold transition flex items-center space-x-1 flex-shrink-0">
                  <span>Learn with AI</span>
                  <i data-lucide="arrow-right" class="w-3 h-3"></i>
                </button>
              </div>

              <p class="text-xs text-slate-600 leading-relaxed"><strong>Definition:</strong> ${c.definition}</p>
              <p class="text-xs text-slate-700 leading-relaxed">${c.detailed_explanation}</p>

              <div class="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-700 space-y-1">
                <p><strong>Why It Matters:</strong> ${c.why_matters}</p>
                <p><strong>Real-World Example:</strong> ${c.example}</p>
              </div>

              <div class="flex flex-wrap gap-1.5 text-[10px] pt-1">
                ${(c.key_points || []).map(kp => `<span class="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">✓ ${kp}</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- C. Frameworks and Models -->
      <section id="sum-sec-frameworks" class="summary-section space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
          <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center">
            <i data-lucide="layers" class="w-4 h-4 mr-1.5 text-indigo-600"></i> Section C: Strategic Frameworks & Models (${s.frameworks?.length || 0})
          </h4>
        </div>
        <div class="space-y-3">
          ${(s.frameworks || []).map(f => `
            <div class="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-2 text-xs">
              <div class="flex items-center justify-between">
                <h5 class="text-sm font-extrabold text-slate-900">${f.name}</h5>
                <span class="text-[10px] text-slate-400 font-semibold">Slide ${f.slide_numbers ? f.slide_numbers.join(', ') : 1}</span>
              </div>
              <p class="text-slate-700"><strong>Why Used:</strong> ${f.why_used}</p>
              <p class="text-slate-700"><strong>How It Works:</strong> ${f.how_works}</p>
              <div class="p-2.5 bg-white rounded-lg border border-slate-100 text-[11px] text-slate-600">
                <strong>Worked Example:</strong> ${f.step_by_step_example}
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- D. Terminology & Glossary -->
      <section id="sum-sec-glossary" class="summary-section space-y-3">
        <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center border-b border-slate-100 pb-2">
          <i data-lucide="list" class="w-4 h-4 mr-1.5 text-cyan-600"></i> Section D: Key Terminology & Glossary
        </h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          ${(s.glossary || []).map(g => `
            <div class="p-3 rounded-lg border border-slate-100 bg-white shadow-2xs">
              <p class="font-bold text-slate-900">${g.term}</p>
              <p class="text-slate-600 mt-1 leading-snug">${g.definition}</p>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- E. Formulas & Calculations -->
      ${s.formulas && s.formulas.length > 0 ? `
      <section id="sum-sec-formulas" class="summary-section space-y-3">
        <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center border-b border-slate-100 pb-2">
          <i data-lucide="calculator" class="w-4 h-4 mr-1.5 text-emerald-600"></i> Section E: Formulas & Calculations
        </h4>
        <div class="space-y-2.5 text-xs">
          ${s.formulas.map(form => `
            <div class="p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/30 space-y-1.5">
              <div class="flex items-center justify-between font-bold text-slate-900">
                <span>${form.name}</span>
                <span class="font-mono text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">${form.formula}</span>
              </div>
              <p class="text-slate-600"><strong>Variables:</strong> ${form.variables}</p>
              <p class="text-slate-700 bg-white p-2 rounded border border-slate-100 font-medium"><strong>Calculation:</strong> ${form.worked_example}</p>
            </div>
          `).join('')}
        </div>
      </section>` : ''}

      <!-- F. Concept Connections -->
      <section id="sum-sec-connections" class="summary-section space-y-3">
        <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center border-b border-slate-100 pb-2">
          <i data-lucide="git-merge" class="w-4 h-4 mr-1.5 text-purple-600"></i> Section F: Concept Connections & Big Picture
        </h4>
        <div class="p-4 rounded-xl border border-slate-200/80 bg-slate-50 text-xs space-y-2">
          <div class="flex items-center space-x-2 text-[11px] font-bold text-slate-700 flex-wrap gap-1">
            ${(s.connections?.hierarchy || ['Foundations', 'Strategy', 'Execution']).map((h, i, arr) => `
              <span class="px-2 py-1 bg-white rounded border border-slate-200">${h}</span>
              ${i < arr.length - 1 ? '<span class="text-slate-400">&rarr;</span>' : ''}
            `).join('')}
          </div>
          <p class="text-slate-700 leading-relaxed">${s.connections?.big_picture_narrative || 'All presentation concepts synthesize into a coherent business strategy.'}</p>
        </div>
      </section>

      <!-- H. Final Revision Sheet -->
      <section id="sum-sec-revision" class="summary-section bg-amber-50/50 p-5 rounded-2xl border border-amber-200/80 space-y-4">
        <div class="flex items-center justify-between border-b border-amber-200/60 pb-2">
          <h4 class="text-xs font-extrabold uppercase tracking-wider text-amber-900 flex items-center">
            <i data-lucide="check-circle" class="w-4 h-4 mr-1.5 text-amber-600"></i> Section H: Final High-Yield Revision Sheet
          </h4>
          <span class="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">MBA Exam Ready</span>
        </div>
        
        <div>
          <h5 class="text-xs font-bold text-slate-800 mb-1.5">Must-Know Key Points:</h5>
          <ul class="space-y-1 text-xs text-slate-700">
            ${(s.revision?.must_know_points || []).map(pt => `<li class="flex items-start"><span class="text-amber-600 font-bold mr-2">✓</span>${pt}</li>`).join('')}
          </ul>
        </div>

        <div>
          <h5 class="text-xs font-bold text-slate-800 mb-1.5">Likely MBA Exam Questions:</h5>
          <ul class="space-y-1.5 text-xs text-slate-700">
            ${(s.revision?.likely_exam_questions || []).map(q => `<li class="p-2 bg-white rounded-lg border border-amber-100 font-medium">${q}</li>`).join('')}
          </ul>
        </div>

        <div class="text-xs text-slate-600 bg-white/80 p-3 rounded-lg border border-amber-100">
          <strong>10-Minute Recap:</strong> ${s.revision?.quick_recap_10min || 'Consolidated exam summary.'}
        </div>
      </section>
    `;

    container.innerHTML = html;
  },

  filterSummaryContent() {
    const q = document.getElementById('summary-search-input').value.toLowerCase().trim();
    document.querySelectorAll('.summary-concept-card').forEach(card => {
      const txt = card.innerText.toLowerCase();
      if (!q || txt.includes(q)) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  },

  filterSummarySection(sec) {
    document.querySelectorAll('.sum-filter-btn').forEach(b => {
      b.className = 'sum-filter-btn px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200';
    });
    if (event?.target) {
      event.target.className = 'sum-filter-btn px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-200';
    }

    const sections = {
      all: ['sum-sec-overview', 'sum-sec-concepts', 'sum-sec-frameworks', 'sum-sec-glossary', 'sum-sec-formulas', 'sum-sec-connections', 'sum-sec-revision'],
      concepts: ['sum-sec-concepts'],
      frameworks: ['sum-sec-frameworks'],
      glossary: ['sum-sec-glossary'],
      formulas: ['sum-sec-formulas'],
      revision: ['sum-sec-revision']
    };

    const targetList = sections[sec] || sections.all;
    document.querySelectorAll('.summary-section').forEach(el => {
      if (targetList.includes(el.id)) {
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    });
  },

  switchWorkspaceTab(tabName) {
    if (!this.state.workspace) return;
    this.state.workspace.activeTab = tabName;

    const tabs = ['summary', 'learn', 'slides', 'practice'];
    tabs.forEach(t => {
      const btn = document.getElementById(`ws-tab-btn-${t}`);
      const canvas = document.getElementById(`workspace-canvas-${t}`);
      if (t === tabName) {
        if (btn) btn.className = 'px-3.5 py-1.5 rounded-lg transition-all text-slate-900 bg-white shadow-xs font-bold';
        if (canvas) canvas.classList.remove('hidden');
      } else {
        if (btn) btn.className = 'px-3.5 py-1.5 rounded-lg transition-all text-slate-600 hover:text-slate-900 font-medium';
        if (canvas) canvas.classList.add('hidden');
      }
    });
    this.initLucide();
  },

  async selectWorkspaceConcept(conceptName, switchTab = true) {
    const ws = this.state.workspace;
    if (!ws) return;
    ws.activeConceptName = conceptName;

    // Update active concept in left tree
    this.renderWorkspaceLeftPanel();

    // Call teaching package API
    try {
      const pkg = await API.teachPresentationConcept(ws.doc.id, conceptName);
      ws.activeSlideNumber = pkg.slide_number || 1;
      this.renderTeachingSteps(pkg);
      this.renderWorkspaceSlide();

      // Update tutor header
      const tutorRef = document.getElementById('tutor-active-slide-ref');
      if (tutorRef) tutorRef.innerText = `Slide ${pkg.slide_number || 1}`;

      // Update session on backend
      API.updatePresentationSession(ws.doc.id, {
        current_concept_name: conceptName,
        current_slide_number: ws.activeSlideNumber
      }).catch(() => {});

      if (switchTab) {
        this.switchWorkspaceTab('learn');
      }
      this.initLucide();
    } catch (err) {
      console.error('Error fetching concept teaching package:', err);
    }
  },

  renderTeachingSteps(pkg) {
    document.getElementById('learn-active-concept-title').innerText = pkg.concept_name;
    document.getElementById('learn-slide-citation').innerText = pkg.source_citation || `Source: Slide ${pkg.slide_number}`;
    
    const ctrlInd = document.getElementById('learn-control-indicator');
    if (ctrlInd) {
      if (pkg.control_title && pkg.control_action) {
        ctrlInd.classList.remove('hidden');
        ctrlInd.innerText = pkg.control_title;
      } else {
        ctrlInd.classList.add('hidden');
      }
    }

    const container = document.getElementById('learn-steps-container');
    if (!container || !pkg.steps) return;

    container.innerHTML = pkg.steps.map(step => {
      // Step 8 is quick comprehension check
      if (step.step_number === 8) {
        const optionsHtml = (step.options || []).map((opt, oIdx) => `
          <button onclick="App.checkComprehensionAnswer(${oIdx}, ${step.correct_index}, '${(step.explanation || '').replace(/'/g, "\\'")}')" class="comp-opt-btn w-full text-left p-3 rounded-xl border border-slate-200 text-xs font-medium hover:border-blue-500 hover:bg-blue-50/50 transition">
            ${opt}
          </button>
        `).join('');

        return `
          <div class="p-5 rounded-2xl border-2 border-indigo-200 bg-indigo-50/30 space-y-3">
            <div class="flex items-center space-x-2">
              <span class="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">8</span>
              <h4 class="text-sm font-extrabold text-slate-900">${step.title}</h4>
            </div>
            <p class="text-xs font-bold text-slate-800">${step.question}</p>
            <div id="comprehension-options-list" class="space-y-2">
              ${optionsHtml}
            </div>
            <div id="comprehension-feedback" class="hidden p-3 rounded-xl text-xs font-medium"></div>
          </div>
        `;
      }

      // Steps 1 to 7
      return `
        <div class="p-4 rounded-xl border border-slate-200/80 bg-white shadow-2xs space-y-2">
          <div class="flex items-center space-x-2">
            <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[11px]">${step.step_number}</span>
            <h4 class="text-xs font-extrabold text-slate-800">${step.title}</h4>
          </div>
          <div class="text-xs text-slate-700 leading-relaxed whitespace-pre-line pl-7">
            ${step.content}
          </div>
        </div>
      `;
    }).join('');
  },

  checkComprehensionAnswer(selectedIdx, correctIdx, explanation) {
    const feedback = document.getElementById('comprehension-feedback');
    if (!feedback) return;

    document.querySelectorAll('.comp-opt-btn').forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === correctIdx) {
        btn.className = 'w-full text-left p-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-emerald-900 text-xs font-bold';
      } else if (idx === selectedIdx && selectedIdx !== correctIdx) {
        btn.className = 'w-full text-left p-3 rounded-xl border-2 border-rose-500 bg-rose-50 text-rose-900 text-xs font-semibold';
      }
    });

    feedback.classList.remove('hidden');
    if (selectedIdx === correctIdx) {
      feedback.className = 'p-3 rounded-xl bg-emerald-100/80 text-emerald-900 border border-emerald-300 text-xs leading-relaxed';
      feedback.innerHTML = `<strong>Correct! Excellent MBA reasoning.</strong><br>${explanation}`;
    } else {
      feedback.className = 'p-3 rounded-xl bg-rose-100/80 text-rose-900 border border-rose-300 text-xs leading-relaxed';
      feedback.innerHTML = `<strong>Review Required:</strong><br>${explanation}`;
    }
  },

  async triggerTeachingControl(action) {
    const ws = this.state.workspace;
    if (!ws || !ws.activeConceptName) return;

    try {
      const pkg = await API.teachPresentationConcept(ws.doc.id, ws.activeConceptName, action);
      this.renderTeachingSteps(pkg);
      this.switchWorkspaceTab('learn');

      // Also append explanation into tutor chat panel
      const tutorMessages = document.getElementById('workspace-tutor-messages');
      if (tutorMessages) {
        tutorMessages.innerHTML += `
          <div class="p-2.5 rounded-xl bg-blue-50 text-blue-900 text-xs font-medium">
            <strong>Vishal:</strong> [Teaching Action: ${pkg.control_title}]
          </div>
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed space-y-1">
            <span class="text-[10px] font-bold text-blue-600 bg-white px-1.5 py-0.5 rounded border border-blue-200">${pkg.source_citation}</span>
            <p class="whitespace-pre-line mt-1">${pkg.steps[1]?.content || pkg.steps[0]?.content}</p>
          </div>
        `;
        tutorMessages.scrollTop = tutorMessages.scrollHeight;
      }
      this.initLucide();
    } catch (err) {
      alert('Error executing teaching control: ' + err.message);
    }
  },

  async sendWorkspaceTutorQuery() {
    const input = document.getElementById('workspace-chat-input');
    const query = input?.value?.trim();
    const ws = this.state.workspace;
    if (!query || !ws) return;

    input.value = '';
    const container = document.getElementById('workspace-tutor-messages');
    if (container) {
      container.innerHTML += `
        <div class="p-2.5 rounded-xl bg-blue-600 text-white text-xs font-medium ml-4">
          ${query}
        </div>
        <div id="ws-tutor-typing" class="text-xs text-slate-400 italic p-1 animate-pulse">
          Consulting presentation slide ${ws.activeSlideNumber}...
        </div>
      `;
      container.scrollTop = container.scrollHeight;
    }

    try {
      const res = await API.presentationTutorChat(ws.doc.id, query, ws.activeConceptName, ws.activeSlideNumber);
      document.getElementById('ws-tutor-typing')?.remove();
      if (container) {
        container.innerHTML += `
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed space-y-1 mr-4">
            <span class="text-[10px] font-bold text-blue-600 bg-white px-1.5 py-0.5 rounded border border-blue-200">${res.citation}</span>
            <p class="whitespace-pre-line mt-1">${res.reply}</p>
          </div>
        `;
        container.scrollTop = container.scrollHeight;
      }
    } catch (err) {
      document.getElementById('ws-tutor-typing')?.remove();
      if (container) {
        container.innerHTML += `<div class="p-2 rounded bg-rose-50 text-rose-700 text-xs">Error: ${err.message}</div>`;
      }
    }
  },

  renderWorkspaceTutorMessages() {
    const ws = this.state.workspace;
    const container = document.getElementById('workspace-tutor-messages');
    if (!container || !ws) return;

    const messages = ws.session?.messages || [];
    if (messages.length === 0) {
      container.innerHTML = `
        <div class="text-center py-6 text-xs text-slate-400 space-y-2">
          <i data-lucide="bot" class="w-8 h-8 mx-auto text-slate-300"></i>
          <p>Ask any follow-up question about this slide or use the 12 teaching controls above.</p>
        </div>
      `;
    } else {
      container.innerHTML = messages.map(m => {
        if (m.role === 'user') {
          return `<div class="p-2.5 rounded-xl bg-blue-600 text-white text-xs font-medium ml-4">${m.content}</div>`;
        } else {
          return `
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed mr-4 space-y-1">
              ${m.citation ? `<span class="text-[10px] font-bold text-blue-600 bg-white px-1.5 py-0.5 rounded border border-blue-200">${m.citation}</span>` : ''}
              <p class="whitespace-pre-line">${m.content}</p>
            </div>
          `;
        }
      }).join('');
      container.scrollTop = container.scrollHeight;
    }
  },

  async markActiveConceptStatus(status) {
    const ws = this.state.workspace;
    if (!ws || !ws.activeConceptName) return;

    try {
      const updatePayload = status === 'understood' 
        ? { mark_understood: ws.activeConceptName } 
        : { mark_revision: ws.activeConceptName };

      const res = await API.updatePresentationSession(ws.doc.id, updatePayload);
      ws.session.understood_concepts = res.understood_concepts;
      ws.session.revision_needed_concepts = res.revision_needed_concepts;
      this.renderWorkspaceLeftPanel();
    } catch (err) {
      console.error('Error marking concept status:', err);
    }
  },

  jumpToWorkspaceSlide(slideNum) {
    const ws = this.state.workspace;
    if (!ws) return;
    ws.activeSlideNumber = slideNum;
    this.renderWorkspaceSlide();
    this.renderWorkspaceLeftPanel();
    this.switchWorkspaceTab('slides');
  },

  prevWorkspaceSlide() {
    const ws = this.state.workspace;
    if (!ws || ws.activeSlideNumber <= 1) return;
    ws.activeSlideNumber--;
    this.renderWorkspaceSlide();
    this.renderWorkspaceLeftPanel();
  },

  nextWorkspaceSlide() {
    const ws = this.state.workspace;
    const maxSlides = ws.doc.slide_count || ws.summary?.overview?.total_slides || 12;
    if (!ws || ws.activeSlideNumber >= maxSlides) return;
    ws.activeSlideNumber++;
    this.renderWorkspaceSlide();
    this.renderWorkspaceLeftPanel();
  },

  renderWorkspaceSlide() {
    const ws = this.state.workspace;
    if (!ws || !ws.doc) return;

    const sNum = ws.activeSlideNumber || 1;
    const totalSlides = ws.doc.slide_count || ws.summary?.overview?.total_slides || 12;

    document.getElementById('ws-slide-num-label').innerText = `Slide ${sNum} of ${totalSlides}`;
    document.getElementById('ws-slide-page-indicator').innerText = `${sNum} / ${totalSlides}`;
    document.getElementById('workspace-slide-counter').innerText = `Slide ${sNum} of ${totalSlides}`;

    // Find chunk for this slide
    const chunks = ws.doc.chunks || [];
    const chunk = chunks.find(c => c.slide_number === sNum) || chunks[sNum - 1];

    const titleEl = document.getElementById('ws-slide-title');
    const contentEl = document.getElementById('ws-slide-content');
    const notesEl = document.getElementById('ws-slide-notes-container');

    if (chunk) {
      if (titleEl) titleEl.innerText = chunk.title || `Slide ${sNum}`;
      if (contentEl) {
        contentEl.innerHTML = (chunk.content || '').split('\n').map(l => {
          if (l.trim().startsWith('-') || l.trim().startsWith('•') || l.trim().startsWith('*')) {
            return `<li class="ml-4 list-disc">${l.replace(/^[-•*]\s*/, '')}</li>`;
          }
          return `<p>${l}</p>`;
        }).join('');
      }
      if (chunk.speaker_notes && notesEl) {
        notesEl.classList.remove('hidden');
        notesEl.innerHTML = `<strong>Speaker Notes:</strong> ${chunk.speaker_notes}`;
      } else if (notesEl) {
        notesEl.classList.add('hidden');
      }
    } else {
      if (titleEl) titleEl.innerText = ws.summary?.concepts[sNum - 1]?.name || `Slide ${sNum}`;
      if (contentEl) contentEl.innerHTML = `<p>${ws.summary?.concepts[sNum - 1]?.detailed_explanation || 'Slide content synthesized.'}</p>`;
      if (notesEl) notesEl.classList.add('hidden');
    }
  },

  renderFlashcardStage() {
    const ws = this.state.workspace;
    const container = document.getElementById('ws-flashcard-stage');
    if (!container || !ws || !ws.flashcards || ws.flashcards.length === 0) {
      if (container) container.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Flashcards generating...</p>';
      return;
    }

    const idx = ws.activeFlashcardIdx || 0;
    const card = ws.flashcards[idx];
    const isFlipped = ws.flashcardFlipped;

    container.innerHTML = `
      <div onclick="App.flipWorkspaceFlashcard()" class="p-8 rounded-3xl border-2 cursor-pointer transition-all min-h-[220px] flex flex-col justify-between shadow-sm select-none ${isFlipped ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200 hover:border-blue-300'}">
        <div class="flex items-center justify-between text-[11px] text-slate-400">
          <span class="font-bold text-blue-600">${card.concept_name}</span>
          <span>Card ${idx + 1} of ${ws.flashcards.length} • Click to Flip</span>
        </div>
        <div class="py-4 text-center">
          ${isFlipped 
            ? `<p class="text-sm text-slate-800 leading-relaxed font-medium">${card.back}</p>`
            : `<h3 class="text-base font-extrabold text-slate-900 leading-snug">${card.front}</h3>`
          }
        </div>
        <div class="text-[10px] text-slate-400 text-center">
          Source: Slide ${card.slide_number || 1} &bull; ${card.mastered ? '<span class="text-emerald-600 font-bold">Mastered ✓</span>' : 'In Practice'}
        </div>
      </div>

      <div class="flex items-center justify-between mt-4">
        <button onclick="App.prevWorkspaceFlashcard()" class="px-4 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50">Previous</button>
        <button onclick="App.masterCurrentFlashcard()" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs">Mark as Mastered</button>
        <button onclick="App.nextWorkspaceFlashcard()" class="px-4 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50">Next</button>
      </div>
    `;
  },

  flipWorkspaceFlashcard() {
    if (!this.state.workspace) return;
    this.state.workspace.flashcardFlipped = !this.state.workspace.flashcardFlipped;
    this.renderFlashcardStage();
  },

  prevWorkspaceFlashcard() {
    const ws = this.state.workspace;
    if (!ws || !ws.flashcards) return;
    ws.activeFlashcardIdx = (ws.activeFlashcardIdx - 1 + ws.flashcards.length) % ws.flashcards.length;
    ws.flashcardFlipped = false;
    this.renderFlashcardStage();
  },

  nextWorkspaceFlashcard() {
    const ws = this.state.workspace;
    if (!ws || !ws.flashcards) return;
    ws.activeFlashcardIdx = (ws.activeFlashcardIdx + 1) % ws.flashcards.length;
    ws.flashcardFlipped = false;
    this.renderFlashcardStage();
  },

  async masterCurrentFlashcard() {
    const ws = this.state.workspace;
    if (!ws || !ws.flashcards) return;
    const card = ws.flashcards[ws.activeFlashcardIdx];
    if (card) {
      card.mastered = 1;
      API.masterFlashcard(ws.doc.id, card.id).catch(() => {});
      this.nextWorkspaceFlashcard();
    }
  },

  renderWorkspaceExamQuestions() {
    const ws = this.state.workspace;
    const container = document.getElementById('ws-exam-questions-list');
    if (!container || !ws || !ws.summary) return;

    const questions = ws.summary.revision?.likely_exam_questions || [];
    container.innerHTML = questions.map((q, idx) => `
      <div class="p-4 rounded-xl border border-slate-200/80 bg-white space-y-2">
        <div class="flex items-start justify-between gap-3">
          <p class="text-xs font-bold text-slate-900 leading-snug">Q${idx + 1}: ${q}</p>
          <button onclick="document.getElementById('exam-ans-${idx}').classList.toggle('hidden')" class="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition flex-shrink-0">
            Model Answer
          </button>
        </div>
        <div id="exam-ans-${idx}" class="hidden pt-2 border-t border-slate-100 text-xs text-slate-700 leading-relaxed bg-slate-50/60 p-2.5 rounded-lg">
          <strong>Strategic Model Answer:</strong> When addressing this examination prompt, executive candidates must synthesize both strategic positioning (Hamilton Helmer's moats) and operational mechanics. Ground arguments in validated customer discovery and quantifiable unit economics.
        </div>
      </div>
    `).join('');
  },

  exportWorkspaceMarkdown() {
    const ws = this.state.workspace;
    if (!ws || !ws.summary) return;
    const s = ws.summary;

    let md = `# ${s.overview?.title || ws.doc.name}\n\n`;
    md += `**Subject:** ${s.overview?.subject || 'MBA Core'} | **Total Slides:** ${s.overview?.total_slides || 12}\n\n`;
    md += `## Central Objective\n${s.overview?.central_objective}\n\n`;
    md += `## 1. Concept-by-Concept Summary\n\n`;
    (s.concepts || []).forEach((c, i) => {
      md += `### ${i + 1}. ${c.name} (Slide ${c.slide_numbers ? c.slide_numbers.join(', ') : 1})\n`;
      md += `- **Definition:** ${c.definition}\n`;
      md += `- **Detailed Explanation:** ${c.detailed_explanation}\n`;
      md += `- **Why It Matters:** ${c.why_matters}\n`;
      md += `- **Practical Example:** ${c.example}\n`;
      md += `- **Key Points:** ${c.key_points ? c.key_points.join('; ') : ''}\n\n`;
    });

    if (s.frameworks && s.frameworks.length > 0) {
      md += `## 2. Strategic Frameworks\n\n`;
      s.frameworks.forEach(f => {
        md += `### ${f.name}\n- **Why Used:** ${f.why_used}\n- **How It Works:** ${f.how_works}\n- **Example:** ${f.step_by_step_example}\n\n`;
      });
    }

    md += `## 3. High-Yield Revision Sheet\n\n### Must-Know Key Points:\n`;
    (s.revision?.must_know_points || []).forEach(pt => { md += `- ${pt}\n`; });
    md += `\n### Likely MBA Exam Questions:\n`;
    (s.revision?.likely_exam_questions || []).forEach(q => { md += `- **${q}**\n`; });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${(s.overview?.title || 'MBA_Summary').replace(/\s+/g, '_')}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  exportWorkspacePrintable() {
    const ws = this.state.workspace;
    if (!ws || !ws.doc) return;
    window.open(`/api/presentations/${ws.doc.id}/export-printable`, '_blank');
  }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
