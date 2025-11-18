/**
 * Export Manager for Koby
 * Manages all export functionality and UI interactions
 */

import { PKMExporter } from './pkm-exporter.js';
import { FlashcardExporter } from './flashcard-exporter.js';

export class ExportManager {
    constructor() {
        this.pkmExporter = null;
        this.flashcardExporter = null;
        this.currentData = null;
    }

    /**
     * Initialize with user data
     */
    init(books, highlights, words) {
        this.currentData = { books, highlights, words };
        this.pkmExporter = new PKMExporter(books, highlights, words);
        this.flashcardExporter = new FlashcardExporter(words, highlights);
    }

    /**
     * Show PKM export modal
     */
    showPKMExportModal() {
        if (!this.pkmExporter) {
            alert('Please load your data first');
            return;
        }

        const modal = document.getElementById('pkm-export-modal');
        if (!modal) {
            this.createPKMExportModal();
        }

        document.getElementById('pkm-export-modal').style.display = 'flex';
        this.updatePKMBookList();
    }

    /**
     * Show flashcard export modal
     */
    showFlashcardExportModal() {
        if (!this.flashcardExporter || !this.currentData.words || this.currentData.words.length === 0) {
            alert('No vocabulary words found. Look up words while reading on your Kobo to create flashcards!');
            return;
        }

        const modal = document.getElementById('flashcard-export-modal');
        if (!modal) {
            this.createFlashcardExportModal();
        }

        document.getElementById('flashcard-export-modal').style.display = 'flex';
        this.updateFlashcardStats();
    }

    /**
     * Create PKM export modal
     */
    createPKMExportModal() {
        const modalHTML = `
            <div id="pkm-export-modal" class="export-modal" style="display: none;">
                <div class="export-modal-content">
                    <div class="export-modal-header">
                        <h2>📚 Export to PKM Tool</h2>
                        <button class="close-button" onclick="exportManager.closeModal('pkm-export-modal')">&times;</button>
                    </div>

                    <div class="export-modal-body">
                        <!-- Format Selection -->
                        <div class="export-section">
                            <h3>Select Format</h3>
                            <div class="format-selector">
                                <label class="format-option">
                                    <input type="radio" name="pkm-format" value="obsidian" checked>
                                    <div class="format-card">
                                        <div class="format-icon">🔮</div>
                                        <div class="format-name">Obsidian</div>
                                        <div class="format-desc">YAML frontmatter, callout blocks</div>
                                    </div>
                                </label>

                                <label class="format-option">
                                    <input type="radio" name="pkm-format" value="notion">
                                    <div class="format-card">
                                        <div class="format-icon">📝</div>
                                        <div class="format-name">Notion</div>
                                        <div class="format-desc">Emoji headers, tables</div>
                                    </div>
                                </label>

                                <label class="format-option">
                                    <input type="radio" name="pkm-format" value="logseq">
                                    <div class="format-card">
                                        <div class="format-icon">🌳</div>
                                        <div class="format-name">Logseq</div>
                                        <div class="format-desc">Bullet hierarchy</div>
                                    </div>
                                </label>

                                <label class="format-option">
                                    <input type="radio" name="pkm-format" value="markdown">
                                    <div class="format-card">
                                        <div class="format-icon">📄</div>
                                        <div class="format-name">Markdown</div>
                                        <div class="format-desc">Plain markdown</div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Book Selection -->
                        <div class="export-section">
                            <h3>Select Books</h3>
                            <div class="book-selection">
                                <label>
                                    <input type="radio" name="book-selection" value="all" checked onchange="exportManager.toggleBookList(false)">
                                    <span>All Books (<span id="total-book-count">0</span>)</span>
                                </label>
                                <label>
                                    <input type="radio" name="book-selection" value="selected" onchange="exportManager.toggleBookList(true)">
                                    <span>Select Specific Books</span>
                                </label>
                            </div>
                            <div id="book-list-container" style="display: none;">
                                <div id="book-checklist" class="book-checklist"></div>
                            </div>
                        </div>

                        <!-- Export Options -->
                        <div class="export-section">
                            <h3>Export Options</h3>
                            <div class="export-options">
                                <label>
                                    <input type="checkbox" id="include-highlights" checked>
                                    <span>Include highlights</span>
                                </label>
                                <label>
                                    <input type="checkbox" id="include-annotations" checked>
                                    <span>Include my notes</span>
                                </label>
                                <label>
                                    <input type="checkbox" id="include-words" checked>
                                    <span>Include vocabulary words</span>
                                </label>
                                <label>
                                    <input type="checkbox" id="include-metadata" checked>
                                    <span>Include metadata (dates, progress, etc.)</span>
                                </label>
                            </div>
                        </div>

                        <!-- File Structure -->
                        <div class="export-section">
                            <h3>File Structure</h3>
                            <div class="file-structure-options">
                                <label>
                                    <input type="radio" name="file-structure" value="single" checked>
                                    <span>Single file (all books combined)</span>
                                </label>
                                <label>
                                    <input type="radio" name="file-structure" value="multiple">
                                    <span>One file per book (.zip archive)</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="export-modal-footer">
                        <button class="btn-secondary" onclick="exportManager.closeModal('pkm-export-modal')">Cancel</button>
                        <button class="btn-primary" onclick="exportManager.executePKMExport()">
                            <span class="btn-icon">📥</span> Export
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    /**
     * Create flashcard export modal
     */
    createFlashcardExportModal() {
        const modalHTML = `
            <div id="flashcard-export-modal" class="export-modal" style="display: none;">
                <div class="export-modal-content">
                    <div class="export-modal-header">
                        <h2>🎴 Export to Flashcards</h2>
                        <button class="close-button" onclick="exportManager.closeModal('flashcard-export-modal')">&times;</button>
                    </div>

                    <div class="export-modal-body">
                        <!-- Format Selection -->
                        <div class="export-section">
                            <h3>Select Format</h3>
                            <div class="format-selector">
                                <label class="format-option">
                                    <input type="radio" name="flashcard-format" value="anki-csv" checked>
                                    <div class="format-card">
                                        <div class="format-icon">🅰️</div>
                                        <div class="format-name">Anki CSV</div>
                                        <div class="format-desc">Import to AnkiWeb or desktop</div>
                                    </div>
                                </label>

                                <label class="format-option">
                                    <input type="radio" name="flashcard-format" value="quizlet">
                                    <div class="format-card">
                                        <div class="format-icon">📋</div>
                                        <div class="format-name">Quizlet</div>
                                        <div class="format-desc">Copy-paste into Quizlet</div>
                                    </div>
                                </label>

                                <label class="format-option">
                                    <input type="radio" name="flashcard-format" value="generic-csv">
                                    <div class="format-card">
                                        <div class="format-icon">📊</div>
                                        <div class="format-name">Generic CSV</div>
                                        <div class="format-desc">Works with most apps</div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Export Options -->
                        <div class="export-section">
                            <h3>Export Options</h3>
                            <div class="export-options">
                                <label>
                                    <input type="checkbox" id="flashcard-include-sentence" checked>
                                    <span>Include sentence context</span>
                                    <small>Show the word used in a sentence from your highlights</small>
                                </label>
                                <label>
                                    <input type="checkbox" id="flashcard-include-source" checked>
                                    <span>Include source book</span>
                                    <small>Show which book the word came from</small>
                                </label>
                                <label>
                                    <input type="checkbox" id="flashcard-fetch-definitions" checked>
                                    <span>Fetch definitions automatically</span>
                                    <small>Look up word definitions (may take a moment)</small>
                                </label>
                            </div>
                        </div>

                        <!-- Statistics -->
                        <div class="export-section">
                            <div class="flashcard-stats">
                                <div class="stat-item">
                                    <span class="stat-value" id="flashcard-total-words">0</span>
                                    <span class="stat-label">Total Words</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value" id="flashcard-unique-books">0</span>
                                    <span class="stat-label">Unique Books</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value" id="flashcard-with-context">0%</span>
                                    <span class="stat-label">With Context</span>
                                </div>
                            </div>
                        </div>

                        <!-- Preview -->
                        <div class="export-section">
                            <h3>Preview (First 3 Cards)</h3>
                            <div id="flashcard-preview" class="flashcard-preview-container">
                                <div class="preview-loading">Click "Generate Preview" to see sample cards</div>
                            </div>
                            <button class="btn-secondary btn-small" onclick="exportManager.generateFlashcardPreview()">
                                Generate Preview
                            </button>
                        </div>
                    </div>

                    <div class="export-modal-footer">
                        <button class="btn-secondary" onclick="exportManager.closeModal('flashcard-export-modal')">Cancel</button>
                        <button class="btn-primary" onclick="exportManager.executeFlashcardExport()">
                            <span class="btn-icon">📥</span> Export
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    /**
     * Update book list in PKM modal
     */
    updatePKMBookList() {
        const bookCount = this.currentData.books.length;
        const totalCountEl = document.getElementById('total-book-count');
        if (totalCountEl) {
            totalCountEl.textContent = bookCount;
        }

        const bookChecklist = document.getElementById('book-checklist');
        if (!bookChecklist) return;

        bookChecklist.innerHTML = '';
        this.currentData.books.forEach(book => {
            const bookId = book.book_id || book.doc_id;
            const checkbox = document.createElement('label');
            checkbox.className = 'book-checkbox-item';
            checkbox.innerHTML = `
                <input type="checkbox" value="${bookId}" checked>
                <span class="book-title">${book.title}</span>
                <span class="book-author">${book.author || 'Unknown Author'}</span>
            `;
            bookChecklist.appendChild(checkbox);
        });
    }

    /**
     * Update flashcard statistics
     */
    updateFlashcardStats() {
        const stats = this.flashcardExporter.getStats();

        const totalEl = document.getElementById('flashcard-total-words');
        const booksEl = document.getElementById('flashcard-unique-books');
        const contextEl = document.getElementById('flashcard-with-context');

        if (totalEl) totalEl.textContent = stats.totalWords;
        if (booksEl) booksEl.textContent = stats.uniqueBooks;
        if (contextEl) contextEl.textContent = stats.contextPercentage + '%';
    }

    /**
     * Toggle book list visibility
     */
    toggleBookList(show) {
        const container = document.getElementById('book-list-container');
        if (container) {
            container.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Execute PKM export
     */
    async executePKMExport() {
        const format = document.querySelector('input[name="pkm-format"]:checked').value;
        const bookSelection = document.querySelector('input[name="book-selection"]:checked').value;
        const fileStructure = document.querySelector('input[name="file-structure"]:checked').value;

        const options = {
            includeAnnotations: document.getElementById('include-annotations').checked,
            includeMetadata: document.getElementById('include-metadata').checked,
            includeWords: document.getElementById('include-words').checked,
            fileStructure: fileStructure,
            bookIds: 'all'
        };

        // Get selected books if specific selection
        if (bookSelection === 'selected') {
            const selectedBoxes = document.querySelectorAll('#book-checklist input:checked');
            options.bookIds = Array.from(selectedBoxes).map(cb => cb.value);

            if (options.bookIds.length === 0) {
                alert('Please select at least one book to export');
                return;
            }
        }

        // Show loading state
        const exportBtn = event.target;
        const originalText = exportBtn.innerHTML;
        exportBtn.innerHTML = '<span class="spinner"></span> Exporting...';
        exportBtn.disabled = true;

        try {
            switch (format) {
                case 'obsidian':
                    await this.pkmExporter.exportToObsidian(options);
                    break;
                case 'notion':
                    await this.pkmExporter.exportToNotion(options);
                    break;
                case 'logseq':
                    await this.pkmExporter.exportToLogseq(options);
                    break;
                case 'markdown':
                    options.format = 'markdown';
                    await this.pkmExporter.exportToObsidian(options);
                    break;
            }

            // Track analytics
            if (window.analytics) {
                logEvent(window.analytics, 'export_pkm', {
                    format: format,
                    book_count: options.bookIds === 'all' ? this.currentData.books.length : options.bookIds.length,
                    file_structure: fileStructure
                });
            }

            this.closeModal('pkm-export-modal');
            this.showSuccessMessage('Export successful! Check your downloads folder.');
        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed: ' + error.message);
        } finally {
            exportBtn.innerHTML = originalText;
            exportBtn.disabled = false;
        }
    }

    /**
     * Execute flashcard export
     */
    async executeFlashcardExport() {
        const format = document.querySelector('input[name="flashcard-format"]:checked').value;

        const options = {
            includeSentence: document.getElementById('flashcard-include-sentence').checked,
            includeSource: document.getElementById('flashcard-include-source').checked,
            fetchDefinitions: document.getElementById('flashcard-fetch-definitions').checked
        };

        // Show loading state
        const exportBtn = event.target;
        const originalText = exportBtn.innerHTML;
        exportBtn.innerHTML = '<span class="spinner"></span> Exporting...';
        exportBtn.disabled = true;

        try {
            switch (format) {
                case 'anki-csv':
                    await this.flashcardExporter.exportToAnkiCSV(options);
                    break;
                case 'quizlet':
                    await this.flashcardExporter.exportToQuizlet(options);
                    break;
                case 'generic-csv':
                    await this.flashcardExporter.exportToGenericCSV(options);
                    break;
            }

            // Track analytics
            if (window.analytics) {
                logEvent(window.analytics, 'export_flashcards', {
                    format: format,
                    word_count: this.currentData.words.length,
                    fetch_definitions: options.fetchDefinitions
                });
            }

            this.closeModal('flashcard-export-modal');
            this.showSuccessMessage('Export successful! Check your downloads folder.');
        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed: ' + error.message);
        } finally {
            exportBtn.innerHTML = originalText;
            exportBtn.disabled = false;
        }
    }

    /**
     * Generate flashcard preview
     */
    async generateFlashcardPreview() {
        const options = {
            includeSentence: document.getElementById('flashcard-include-sentence').checked,
            includeSource: document.getElementById('flashcard-include-source').checked,
            fetchDefinitions: document.getElementById('flashcard-fetch-definitions').checked
        };

        const previewContainer = document.getElementById('flashcard-preview');
        previewContainer.innerHTML = '<div class="preview-loading">Generating preview...</div>';

        try {
            const preview = await this.flashcardExporter.generatePreview(options);

            previewContainer.innerHTML = '';
            preview.slice(0, 3).forEach(card => {
                const cardEl = document.createElement('div');
                cardEl.className = 'preview-card';
                cardEl.innerHTML = `
                    <div class="card-front"><strong>${card.front}</strong></div>
                    <div class="card-back">${card.back}</div>
                    ${card.context ? `<div class="card-context"><em>"${card.context}"</em></div>` : ''}
                    ${card.source ? `<div class="card-source">— ${card.source}</div>` : ''}
                `;
                previewContainer.appendChild(cardEl);
            });
        } catch (error) {
            previewContainer.innerHTML = '<div class="preview-error">Error generating preview</div>';
        }
    }

    /**
     * Close modal
     */
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Show success message
     */
    showSuccessMessage(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'toast-notification success';
        toast.innerHTML = `
            <span class="toast-icon">✅</span>
            <span class="toast-message">${message}</span>
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Create global instance
window.exportManager = new ExportManager();
