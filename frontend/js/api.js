// API Client for VISHAL SINGH LMS
const API_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? '' 
  : '';

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
    const res = await fetch(`/api/auth/logout?token=${token || ''}`, { method: 'POST' });
    return res.json();
  },

  async getCurrentUser(token) {
    const res = await fetch(`/api/auth/me?token=${token || ''}`);
    if (!res.ok) return { authenticated: false };
    return res.json();
  },

  // Stats
  async getStats() {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  // Subjects
  async getSubjects() {
    const res = await fetch('/api/subjects');
    if (!res.ok) throw new Error('Failed to fetch subjects');
    return res.json();
  },

  async createSubject(data) {
    const res = await fetch('/api/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create subject');
    return res.json();
  },

  async deleteSubject(id) {
    const res = await fetch(`/api/subjects/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete subject');
    return res.json();
  },

  async updateTopicStatus(id, status, progress) {
    const res = await fetch(`/api/topics/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, progress })
    });
    if (!res.ok) throw new Error('Failed to update topic status');
    return res.json();
  },

  // Documents
  async getDocuments(params = {}) {
    const q = new URLSearchParams(params).toString();
    const res = await fetch(`/api/documents?${q}`);
    if (!res.ok) throw new Error('Failed to fetch documents');
    return res.json();
  },

  async getDocument(id) {
    const res = await fetch(`/api/documents/${id}`);
    if (!res.ok) throw new Error('Failed to fetch document details');
    return res.json();
  },

  async uploadDocument(formData) {
    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Upload failed');
    }
    return res.json();
  },

  async deleteDocument(id) {
    const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete document');
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
    const res = await fetch(`/api/presentations/${docId}/analyze`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Presentation analysis failed');
    }
    return res.json();
  },

  async getPresentationSummary(docId) {
    const res = await fetch(`/api/presentations/${docId}/summary`);
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

  async teachPresentationConcept(docId, conceptName, controlAction = null) {
    const res = await fetch(`/api/presentations/${docId}/teach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concept_name: conceptName, control_action: controlAction })
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

  async getPresentationFlashcards(docId) {
    const res = await fetch(`/api/presentations/${docId}/flashcards`);
    if (!res.ok) throw new Error('Failed to fetch presentation flashcards');
    return res.json();
  },

  async masterFlashcard(docId, cardId) {
    const res = await fetch(`/api/presentations/${docId}/flashcards/${cardId}/master`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to master flashcard');
    return res.json();
  }
};
