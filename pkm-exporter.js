/**
 * PKM Exporter for Koby
 * One-click export to Obsidian, Notion, Logseq, and other PKM tools
 */

export class PKMExporter {
    constructor(books, highlights, words) {
        this.books = books || [];
        this.highlights = highlights || [];
        this.words = words || [];
    }

    /**
     * Export to Obsidian-optimized Markdown
     */
    async exportToObsidian(options = {}) {
        const {
            bookIds = 'all',
            includeAnnotations = true,
            includeMetadata = true,
            includeWords = true,
            groupBy = 'book',
            fileStructure = 'single'
        } = options;

        if (fileStructure === 'single') {
            const markdown = this.generateObsidianMarkdown(bookIds, options);
            this.downloadFile(`Koby_Export_${this.getDateString()}.md`, markdown);
        } else {
            const files = this.generateMultipleFiles(bookIds, options, 'obsidian');
            await this.downloadZip(files, `Koby_Export_${this.getDateString()}.zip`);
        }
    }

    /**
     * Export to Notion-optimized Markdown
     */
    async exportToNotion(options = {}) {
        const {
            bookIds = 'all',
            includeAnnotations = true,
            includeMetadata = true,
            includeWords = true,
            fileStructure = 'multiple' // Notion works better with one file per book
        } = options;

        const files = this.generateMultipleFiles(bookIds, { ...options, format: 'notion' }, 'notion');
        await this.downloadZip(files, `Koby_Notion_Export_${this.getDateString()}.zip`);
    }

    /**
     * Export to Logseq format
     */
    async exportToLogseq(options = {}) {
        const {
            bookIds = 'all',
            includeAnnotations = true,
            includeWords = true
        } = options;

        const files = this.generateMultipleFiles(bookIds, { ...options, format: 'logseq' }, 'logseq');
        await this.downloadZip(files, `Koby_Logseq_Export_${this.getDateString()}.zip`);
    }

    /**
     * Generate Obsidian Markdown for all selected books
     */
    generateObsidianMarkdown(bookIds, options) {
        const selectedBooks = this.getSelectedBooks(bookIds);
        let markdown = '';

        selectedBooks.forEach((book, index) => {
            markdown += this.generateObsidianBookMarkdown(book, options);
            if (index < selectedBooks.length - 1) {
                markdown += '\n\n---\n\n';
            }
        });

        return markdown;
    }

    /**
     * Generate Markdown for a single book (Obsidian format)
     */
    generateObsidianBookMarkdown(book, options) {
        const { includeAnnotations, includeMetadata, includeWords } = options;
        let md = '';

        // Frontmatter
        if (includeMetadata) {
            md += '---\n';
            md += `title: "${this.escapeYaml(book.title)}"\n`;
            if (book.author) md += `author: "${this.escapeYaml(book.author)}"\n`;
            md += `koby_book_id: "${book.book_id || book.doc_id}"\n`;
            md += `date_imported: "${new Date().toISOString().split('T')[0]}"\n`;
            md += 'tags: [books, koby-import]\n';
            md += '---\n\n';
        }

        // Title and metadata
        md += `# ${book.title}\n`;
        if (book.author) md += `**Author:** ${book.author}\n`;
        if (book.percent_read) md += `**Reading Progress:** ${Math.round(book.percent_read * 100)}%\n`;
        if (book.time_spent_reading) md += `**Time Spent Reading:** ${this.formatDuration(book.time_spent_reading)}\n`;
        if (book.date_last_read) md += `**Last Read:** ${this.formatDate(book.date_last_read)}\n`;
        md += '\n---\n\n';

        // Highlights
        const bookHighlights = this.getBookHighlights(book);
        if (bookHighlights.length > 0) {
            md += '## Highlights & Notes\n\n';

            bookHighlights.forEach(highlight => {
                md += `> [!quote] ${this.formatDate(highlight.date_created)}\n`;
                md += `> ${highlight.text.replace(/\n/g, '\n> ')}\n\n`;

                if (includeAnnotations && highlight.annotation) {
                    md += `**My Note:** ${highlight.annotation}\n\n`;
                }

                md += '---\n\n';
            });
        }

        // Vocabulary words
        if (includeWords) {
            const bookWords = this.getBookWords(book);
            if (bookWords.length > 0) {
                md += '## My Words\n\n';
                bookWords.forEach(word => {
                    md += `- **${word.Text}**\n`;
                    if (word.sentence) md += `  - *Sentence:* "${word.sentence}"\n`;
                    md += '\n';
                });
            }
        }

        // Metadata footer
        if (includeMetadata) {
            md += '---\n\n';
            md += '## Metadata\n\n';
            md += `- **Total Highlights:** ${bookHighlights.length}\n`;
            if (includeAnnotations) {
                const notesCount = bookHighlights.filter(h => h.annotation).length;
                md += `- **Total Notes:** ${notesCount}\n`;
            }
            if (includeWords) {
                const bookWords = this.getBookWords(book);
                md += `- **Total Vocabulary Words:** ${bookWords.length}\n`;
            }
            md += `- **Exported from Koby:** ${new Date().toISOString()}\n`;
        }

        return md;
    }

    /**
     * Generate Markdown for Notion format
     */
    generateNotionBookMarkdown(book, options) {
        const { includeAnnotations, includeWords } = options;
        let md = '';

        // Title
        md += `# 📚 ${book.title}\n\n`;

        // Metadata
        if (book.author) md += `**Author:** ${book.author}\n`;
        if (book.percent_read) md += `**Progress:** ${Math.round(book.percent_read * 100)}%\n`;
        if (book.time_spent_reading) md += `**Time Spent:** ${this.formatDuration(book.time_spent_reading)}\n`;
        if (book.date_last_read) md += `**Last Read:** ${this.formatDate(book.date_last_read)}\n`;
        md += '\n---\n\n';

        // Highlights
        const bookHighlights = this.getBookHighlights(book);
        if (bookHighlights.length > 0) {
            md += '## ✨ Highlights\n\n';

            bookHighlights.forEach(highlight => {
                md += `**"${highlight.text}"**\n`;
                md += `📍 ${this.formatDate(highlight.date_created)}\n\n`;

                if (includeAnnotations && highlight.annotation) {
                    md += `💭 ${highlight.annotation}\n\n`;
                }

                md += '---\n\n';
            });
        }

        // Vocabulary
        if (includeWords) {
            const bookWords = this.getBookWords(book);
            if (bookWords.length > 0) {
                md += '## 📖 Vocabulary\n\n';
                md += '| Word | Context |\n';
                md += '|------|----------|\n';
                bookWords.forEach(word => {
                    const sentence = word.sentence || '';
                    md += `| ${word.Text} | ${sentence.substring(0, 100)}... |\n`;
                });
            }
        }

        return md;
    }

    /**
     * Generate Markdown for Logseq format
     */
    generateLogseqBookMarkdown(book, options) {
        const { includeAnnotations, includeWords } = options;
        let md = '';

        md += `- [[Books]] [[${book.title}]]\n`;
        if (book.author) md += `  - Author:: [[${book.author}]]\n`;
        if (book.percent_read) md += `  - Progress:: ${Math.round(book.percent_read * 100)}%\n`;
        if (book.time_spent_reading) md += `  - Time Spent:: ${this.formatDuration(book.time_spent_reading)}\n`;
        if (book.date_last_read) md += `  - Date Last Read:: [[${this.formatDate(book.date_last_read)}]]\n`;

        const bookHighlights = this.getBookHighlights(book);
        if (bookHighlights.length > 0) {
            md += '  - ## Highlights\n';

            bookHighlights.forEach(highlight => {
                md += `    - {{[[quote]]}} ${highlight.text}\n`;
                md += `      - Date:: [[${this.formatDate(highlight.date_created)}]]\n`;

                if (includeAnnotations && highlight.annotation) {
                    md += `      - Note:: ${highlight.annotation}\n`;
                }
            });
        }

        if (includeWords) {
            const bookWords = this.getBookWords(book);
            if (bookWords.length > 0) {
                md += '  - ## Vocabulary\n';
                bookWords.forEach(word => {
                    md += `    - ${word.Text}\n`;
                    if (word.sentence) md += `      - Context:: ${word.sentence}\n`;
                });
            }
        }

        return md;
    }

    /**
     * Generate multiple files (one per book)
     */
    generateMultipleFiles(bookIds, options, format) {
        const selectedBooks = this.getSelectedBooks(bookIds);
        const files = [];

        selectedBooks.forEach(book => {
            let content = '';
            const filename = this.sanitizeFilename(`${book.title}.md`);

            switch (format) {
                case 'obsidian':
                    content = this.generateObsidianBookMarkdown(book, options);
                    break;
                case 'notion':
                    content = this.generateNotionBookMarkdown(book, options);
                    break;
                case 'logseq':
                    content = this.generateLogseqBookMarkdown(book, options);
                    break;
                default:
                    content = this.generateObsidianBookMarkdown(book, options);
            }

            files.push({ filename, content });
        });

        return files;
    }

    /**
     * Get selected books
     */
    getSelectedBooks(bookIds) {
        if (bookIds === 'all') {
            return this.books;
        }
        return this.books.filter(b => bookIds.includes(b.book_id || b.doc_id));
    }

    /**
     * Get highlights for a specific book
     */
    getBookHighlights(book) {
        const bookId = book.book_id || book.doc_id;
        return this.highlights
            .filter(h => h.book_id === bookId)
            .sort((a, b) => new Date(a.date_created) - new Date(b.date_created));
    }

    /**
     * Get vocabulary words for a specific book
     */
    getBookWords(book) {
        return this.words.filter(w =>
            w.BookTitle === book.title ||
            w.book_title === book.title
        );
    }

    /**
     * Format duration in minutes to readable string
     */
    formatDuration(minutes) {
        if (!minutes) return '0m';
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    }

    /**
     * Format date
     */
    formatDate(dateString) {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            return dateString;
        }
    }

    /**
     * Get current date string for filenames
     */
    getDateString() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Sanitize filename
     */
    sanitizeFilename(filename) {
        return filename.replace(/[/\\?%*:|"<>]/g, '-');
    }

    /**
     * Escape YAML special characters
     */
    escapeYaml(str) {
        if (!str) return '';
        return str.replace(/"/g, '\\"');
    }

    /**
     * Download a single file
     */
    downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Download multiple files as ZIP
     */
    async downloadZip(files, zipName) {
        // Dynamic import of JSZip (assuming it's loaded)
        if (typeof JSZip === 'undefined') {
            console.error('JSZip library not loaded. Please include it in your HTML.');
            alert('JSZip library required. Please reload the page.');
            return;
        }

        const zip = new JSZip();
        files.forEach(({ filename, content }) => {
            zip.file(filename, content);
        });

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
