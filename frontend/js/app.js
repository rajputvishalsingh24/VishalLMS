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
      const res = await API.uploadDocument(form);
      alert(res.message || 'File uploaded and indexed successfully!');
      this.closeUploadModal();
      await this.loadDashboard();
      await this.loadLibrary();
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
  }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
