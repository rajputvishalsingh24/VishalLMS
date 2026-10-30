// API Client for VISHAL SINGH LMS
const API_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? '' 
  : '';

function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem('vishal_lms_token');
  const headers = { ...extra };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Auth-Token'] = token;
  }
  return headers;
}

export const API = {
  // Auth
  async login(username, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Login failed');
    }
    return res.json();
  },

  async logout(token) {
    const activeToken = token || localStorage.getItem('vishal_lms_token') || '';
    const res = await fetch(`/api/auth/logout?token=${activeToken}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return res.json();
  },

  async getCurrentUser(token) {
    const activeToken = token || localStorage.getItem('vishal_lms_token') || '';
    const res = await fetch(`/api/auth/me?token=${activeToken}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) return { authenticated: false };
    return res.json();
  },

  // Stats
  async getStats() {
    const res = await fetch('/api/stats', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  // Subjects
  async getSubjects() {
    const res = await fetch('/api/subjects', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch subjects');
    return res.json();
  },

  async getSubjectDetail(id) {
    const res = await fetch(`/api/subjects/${id}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch subject details');
    return res.json();
  },

  async createSubject(data) {
    const res = await fetch('/api/subjects', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create subject');
    }
    return res.json();
  },

  async updateSubject(id, data) {
    const res = await fetch(`/api/subjects/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update subject');
    }
    return res.json();
  },

  async deleteSubject(id) {
    const res = await fetch(`/api/subjects/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete subject');
    return res.json();
  },

  async updateTopicStatus(id, status, progress) {
    const res = await fetch(`/api/topics/${id}/status`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status, progress })
    });
    if (!res.ok) throw new Error('Failed to update topic status');
    return res.json();
  },

  // Documents
  async getDocuments(params = {}) {
    const q = new URLSearchParams(params).toString();
    const res = await fetch(`/api/documents?${q}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch documents');
    return res.json();
  },

  async getDocument(id) {
    const res = await fetch(`/api/documents/${id}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch document details');
    return res.json();
  },

  async uploadDocument(formData) {
    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Upload failed');
    }
    return res.json();
  },

  async updateDocument(id, data) {
    const res = await fetch(`/api/documents/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update document');
    }
    return res.json();
  },

  async deleteDocument(id) {
    const res = await fetch(`/api/documents/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete document');
    return res.json();
  },

  async retryDocumentProcessing(id) {
    const res = await fetch(`/api/documents/${id}/retry`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to re-process document');
    }
    return res.json();
  },

  // AI Tutor
  async tutorChat(query, mode = 'ask_materials', subjectId = null, documentId = null, detailLevel = 'normal') {
    const res = await fetch('/api/tutor/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, mode, subject_id: subjectId, document_id: documentId, detail_level: detailLevel })
    });
    if (!res.ok) throw new Error('AI Tutor request failed');
    return res.json();
  },

  async getTutorHistory() {
    const res = await fetch('/api/tutor/history');
    if (!res.ok) throw new Error('Failed to fetch tutor history');
    return res.json();
  },

  // Quizzes
  async generateQuiz(data) {
    const res = await fetch('/api/quizzes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Quiz generation failed');
    return res.json();
  },

  async getQuiz(id) {
    const res = await fetch(`/api/quizzes/${id}`);
    if (!res.ok) throw new Error('Failed to fetch quiz');
    return res.json();
  },

  async submitQuiz(id, answers) {
    const res = await fetch(`/api/quizzes/${id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers })
    });
    if (!res.ok) throw new Error('Quiz submission failed');
    return res.json();
  },

  async getQuizHistory() {
    const res = await fetch('/api/quizzes/attempts/history');
    if (!res.ok) throw new Error('Failed to fetch quiz history');
    return res.json();
  },

  // Notes
  async getNotes(subjectId = 'all', noteType = 'all') {
    const res = await fetch(`/api/notes?subject_id=${subjectId}&note_type=${noteType}`);
    if (!res.ok) throw new Error('Failed to fetch notes');
    return res.json();
  },

  async createNote(data) {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create note');
    return res.json();
  },

  async generateNotes(data) {
    const res = await fetch('/api/notes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to generate notes');
    return res.json();
  },

  async deleteNote(id) {
    const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete note');
    return res.json();
  },

  // Progress
  async getProgress() {
    const res = await fetch('/api/progress');
    if (!res.ok) throw new Error('Failed to fetch progress');
    return res.json();
  },

  // Settings
  async getSettings() {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  async updateSettings(data) {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
  },

  async resetSampleData() {
    const res = await fetch('/api/settings/reset-sample', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to reset sample data');
    return res.json();
  },

  // Presentation Summarization & Interactive Learning
  async analyzePresentation(docId) {
    const res = await fetch(`/api/presentations/${docId}/analyze`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Presentation analysis failed');
    }
    return res.json();
  },

  async getPresentationSummary(docId) {
    const res = await fetch(`/api/presentations/${docId}/summary`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch presentation summary');
    return res.json();
  },

  async getPresentationSession(docId) {
    const res = await fetch(`/api/presentations/${docId}/session`);
    if (!res.ok) throw new Error('Failed to fetch presentation session');
    return res.json();
  },

  async updatePresentationSession(docId, data) {
    const res = await fetch(`/api/presentations/${docId}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update presentation session');
    return res.json();
  },

  async teachPresentationConcept(docId, conceptName, controlAction = null, teachingMode = 'MBA') {
    const res = await fetch(`/api/presentations/${docId}/teach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concept_name: conceptName, control_action: controlAction, teaching_mode: teachingMode })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Teaching generation failed');
    }
    return res.json();
  },

  async presentationTutorChat(docId, query, conceptName, slideNumber = 1) {
    const res = await fetch(`/api/presentations/${docId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, concept_name: conceptName, slide_number: slideNumber })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Tutor response failed');
    }
    return res.json();
  },

  async getPresentationChat(docId) {
    const res = await fetch(`/api/presentations/${docId}/chat`);
    if (!res.ok) throw new Error('Failed to fetch chat history');
    return res.json();
  },

  async clearPresentationChat(docId) {
    const res = await fetch(`/api/presentations/${docId}/chat`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to clear chat history');
    return res.json();
  },

  async getPresentationFlashcards(docId) {
    const res = await fetch(`/api/presentations/${docId}/flashcards`);
    if (!res.ok) throw new Error('Failed to fetch presentation flashcards');
    return res.json();
  },

  async masterFlashcard(docId, cardId) {
    const res = await fetch(`/api/presentations/${docId}/flashcards/${cardId}/master`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to master flashcard');
    return res.json();
  },

  // PPT Viewer & Slides
  async getPresentationSlides(docId) {
    const res = await fetch(`/api/presentations/${docId}/slides`);
    if (!res.ok) throw new Error('Failed to fetch presentation slides');
    return res.json();
  },

  // Concept Quizzes (5 Questions Per Concept)
  async getQuizCatalog(docId) {
    const res = await fetch(`/api/presentations/${docId}/quiz-catalog`);
    if (!res.ok) throw new Error('Failed to fetch quiz catalog');
    return res.json();
  },

  async getQuizPrep(docId, conceptName) {
    const res = await fetch(`/api/presentations/${docId}/concepts/${encodeURIComponent(conceptName)}/quiz-prep`);
    if (!res.ok) throw new Error('Failed to fetch quiz prep material');
    return res.json();
  },

  async generateConceptQuiz(docId, conceptName, difficulty = 'Medium', forceRegenerate = false) {
    const res = await fetch(`/api/presentations/${docId}/concepts/${encodeURIComponent(conceptName)}/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty, force_regenerate: forceRegenerate })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to generate concept quiz');
    }
    return res.json();
  },

  async submitQuiz(quizId, answers, timeTaken = 0, mode = 'assessment') {
    const res = await fetch(`/api/quizzes/${quizId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, time_taken_seconds: timeTaken, mode })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Quiz evaluation failed');
    }
    return res.json();
  },

  async regenerateQuiz(quizId) {
    const res = await fetch(`/api/quizzes/${quizId}/regenerate`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to regenerate quiz');
    return res.json();
  },

  // Study Tracking & Analytics
  async recordStudySession(data) {
    const res = await fetch('/api/study/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) return { success: false };
    return res.json();
  },

  async updateConceptStatus(docId, conceptName, status) {
    const res = await fetch(`/api/presentations/${docId}/concepts/${encodeURIComponent(conceptName)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Failed to update concept status');
    return res.json();
  },

  async getLearningAnalytics() {
    const res = await fetch('/api/progress/analytics');
    if (!res.ok) throw new Error('Failed to fetch learning analytics');
    return res.json();
  },

  // Smart Flashcards (SM-2)
  async getDueFlashcards(subjectId = '', docId = '') {
    const q = new URLSearchParams();
    if (subjectId) q.append('subject_id', subjectId);
    if (docId) q.append('document_id', docId);
    const res = await fetch(`/api/flashcards/due?${q.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch due flashcards');
    return res.json();
  },

  async getAllFlashcards(subjectId = '', docId = '') {
    const q = new URLSearchParams();
    if (subjectId) q.append('subject_id', subjectId);
    if (docId) q.append('document_id', docId);
    const res = await fetch(`/api/flashcards?${q.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch flashcards');
    return res.json();
  },

  async createFlashcard(data) {
    const res = await fetch('/api/flashcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create flashcard');
    return res.json();
  },

  async reviewFlashcard(cardId, rating) {
    const res = await fetch(`/api/flashcards/${cardId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating })
    });
    if (!res.ok) throw new Error('Failed to review flashcard');
    return res.json();
  },

  async generateFlashcardsFromDoc(docId) {
    const res = await fetch(`/api/documents/${docId}/generate-flashcards`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to generate flashcards from document');
    return res.json();
  },

  // Doubt Notebook
  async getDoubts(params = {}) {
    const q = new URLSearchParams();
    if (params.subject_id) q.append('subject_id', params.subject_id);
    if (params.document_id) q.append('document_id', params.document_id);
    if (params.status) q.append('status', params.status);
    if (params.search) q.append('search', params.search);
    const res = await fetch(`/api/doubts?${q.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch doubts');
    return res.json();
  },

  async createDoubt(data) {
    const res = await fetch('/api/doubts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to record doubt');
    return res.json();
  },

  async updateDoubtStatus(doubtId, status) {
    const res = await fetch(`/api/doubts/${doubtId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Failed to update doubt status');
    return res.json();
  },

  async resolveDoubtWithAI(doubtId, clarificationPrompt = '') {
    const res = await fetch(`/api/doubts/${doubtId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clarification_prompt: clarificationPrompt })
    });
    if (!res.ok) throw new Error('Failed to resolve doubt with AI');
    return res.json();
  },

  async convertDoubtToFlashcard(doubtId) {
    const res = await fetch(`/api/doubts/${doubtId}/to-flashcard`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to convert doubt to flashcard');
    return res.json();
  },

  // Business Cases
  async getCases(subjectId = '', role = '') {
    const q = new URLSearchParams();
    if (subjectId) q.append('subject_id', subjectId);
    if (role) q.append('role', role);
    const res = await fetch(`/api/cases?${q.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch cases');
    return res.json();
  },

  async generateCase(data) {
    const res = await fetch('/api/cases/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to generate business case');
    return res.json();
  },

  async submitCase(caseId, solutionText) {
    const res = await fetch(`/api/cases/${caseId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solution_text: solutionText })
    });
    if (!res.ok) throw new Error('Failed to submit case evaluation');
    return res.json();
  },

  // AI Interview Simulator
  async getInterviewHistory(subjectId = '') {
    const q = subjectId ? `?subject_id=${subjectId}` : '';
    const res = await fetch(`/api/interviews/history${q}`);
    if (!res.ok) throw new Error('Failed to fetch interview history');
    return res.json();
  },

  async startInterview(data) {
    const res = await fetch('/api/interviews/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to start interview session');
    return res.json();
  },

  async submitInterviewAnswer(sessionId, questionIndex, answerText) {
    const res = await fetch(`/api/interviews/${sessionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_index: questionIndex, answer_text: answerText })
    });
    if (!res.ok) throw new Error('Failed to submit interview answer');
    return res.json();
  },

  // Deterministic Calculators
  async calculateLtvCac(data) {
    const res = await fetch('/api/calculator/ltv-cac', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to calculate LTV:CAC');
    return res.json();
  },

  async calculateNpv(data) {
    const res = await fetch('/api/calculator/npv-payback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to calculate NPV');
    return res.json();
  },

  async calculateBreakeven(data) {
    const res = await fetch('/api/calculator/breakeven', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to calculate Break-Even');
    return res.json();
  },

  async calculateEoq(data) {
    const res = await fetch('/api/calculator/eoq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to calculate EOQ');
    return res.json();
  },

  async calculateRice(data) {
    const res = await fetch('/api/calculator/rice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to calculate RICE');
    return res.json();
  },

  async calculateWacc(data) {
    const res = await fetch('/api/calculator/wacc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to calculate WACC');
    return res.json();
  },

  // Frameworks Library
  async getFrameworks(category = '', search = '') {
    const q = new URLSearchParams();
    if (category) q.append('category', category);
    if (search) q.append('search', search);
    const res = await fetch(`/api/frameworks?${q.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch frameworks');
    return res.json();
  },

  async getFrameworkDetail(id) {
    const res = await fetch(`/api/frameworks/${id}`);
    if (!res.ok) throw new Error('Failed to fetch framework detail');
    return res.json();
  },

  async saveFrameworkNotes(id, notes, linkedDocId = null) {
    const res = await fetch(`/api/frameworks/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, linked_doc_id: linkedDocId })
    });
    if (!res.ok) throw new Error('Failed to save framework notes');
    return res.json();
  },

  // Exams & Mock Tests
  async getExamPlans(subjectId = '') {
    const q = subjectId ? `?subject_id=${subjectId}` : '';
    const res = await fetch(`/api/exams/plans${q}`);
    if (!res.ok) throw new Error('Failed to fetch exam plans');
    return res.json();
  },

  async generateExamPlan(data) {
    const res = await fetch('/api/exams/plans/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to generate exam plan');
    return res.json();
  },

  async generateMockExam(data) {
    const res = await fetch('/api/exams/mock/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to generate mock exam');
    return res.json();
  },

  async submitMockExam(mockId, answers) {
    const res = await fetch(`/api/exams/mock/${mockId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers })
    });
    if (!res.ok) throw new Error('Failed to submit mock exam');
    return res.json();
  },

  // Prerequisites
  async getPrerequisiteGaps(subjectId = '') {
    const q = subjectId ? `?subject_id=${subjectId}` : '';
    const res = await fetch(`/api/prerequisites/gaps${q}`);
    if (!res.ok) throw new Error('Failed to fetch prerequisite gaps');
    return res.json();
  },

  // Cross-Presentation Search
  async crossSearch(query, subjectId = '') {
    const q = new URLSearchParams({ query });
    if (subjectId) q.append('subject_id', subjectId);
    const res = await fetch(`/api/search/cross-presentation?${q.toString()}`);
    if (!res.ok) throw new Error('Failed to execute cross-presentation search');
    return res.json();
  },

  async synthesizeCrossSearch(query, subjectId = '') {
    const res = await fetch('/api/search/cross-presentation/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, subject_id: subjectId })
    });
    if (!res.ok) throw new Error('Failed to synthesize cross-presentation query');
    return res.json();
  },

  // Metacognitive Confidence Matrix
  async logConfidence(data) {
    const res = await fetch('/api/confidence/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) return { success: false };
    return res.json();
  },

  async getConfidenceMatrix() {
    const res = await fetch('/api/confidence/matrix');
    if (!res.ok) throw new Error('Failed to fetch confidence matrix');
    return res.json();
  }
};
