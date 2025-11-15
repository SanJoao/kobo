/**
 * Flashcard Exporter for Koby
 * Export vocabulary words to Anki, Quizlet, and other flashcard apps
 */

export class FlashcardExporter {
    constructor(words, highlights) {
        this.words = words || [];
        this.highlights = highlights || [];
        this.dictionaryCache = new Map();
    }

    /**
     * Export to Anki CSV format
     */
    async exportToAnkiCSV(options = {}) {
        const {
            includeSentence = true,
            includeSource = true,
            fetchDefinitions = true
        } = options;

        let csv = '"Front","Back"';
        if (includeSentence) csv += ',"Context"';
        if (includeSource) csv += ',"Source"';
        csv += '\n';

        for (const word of this.words) {
            const definition = fetchDefinitions ? await this.lookupDefinition(word.Text) : '';
            const sentence = includeSentence ? this.findSentenceContext(word) : '';

            csv += `"${this.escapeCsv(word.Text)}",`;
            csv += `"${this.escapeCsv(definition)}"`;
            if (includeSentence) csv += `,"${this.escapeCsv(sentence)}"`;
            if (includeSource) csv += `,"${this.escapeCsv(word.BookTitle || word.book_title || 'Unknown')}"`;
            csv += '\n';
        }

        this.downloadFile(`koby_vocabulary_${this.getDateString()}.csv`, csv, 'text/csv');
        return csv;
    }

    /**
     * Export to Quizlet format (tab-separated)
     */
    async exportToQuizlet(options = {}) {
        const { fetchDefinitions = true } = options;
        let text = '';

        for (const word of this.words) {
            const definition = fetchDefinitions ? await this.lookupDefinition(word.Text) : 'Definition not found';
            text += `${word.Text}\t${definition}\n`;
        }

        this.downloadFile(`koby_quizlet_${this.getDateString()}.txt`, text, 'text/plain');
        return text;
    }

    /**
     * Export to generic CSV format (compatible with most flashcard apps)
     */
    async exportToGenericCSV(options = {}) {
        const {
            includeSentence = true,
            includeSource = true,
            fetchDefinitions = true
        } = options;

        let csv = 'Word,Definition';
        if (includeSentence) csv += ',Sentence Context';
        if (includeSource) csv += ',Source Book';
        csv += '\n';

        for (const word of this.words) {
            const definition = fetchDefinitions ? await this.lookupDefinition(word.Text) : '';
            const sentence = includeSentence ? this.findSentenceContext(word) : '';

            csv += `${this.escapeCsv(word.Text)},`;
            csv += `${this.escapeCsv(definition)}`;
            if (includeSentence) csv += `,${this.escapeCsv(sentence)}`;
            if (includeSource) csv += `,${this.escapeCsv(word.BookTitle || word.book_title || 'Unknown')}`;
            csv += '\n';
        }

        this.downloadFile(`koby_flashcards_${this.getDateString()}.csv`, csv, 'text/csv');
        return csv;
    }

    /**
     * Find sentence context for a word from highlights
     */
    findSentenceContext(word) {
        // Find the highlight containing this word
        const wordText = word.Text.toLowerCase();
        const bookTitle = word.BookTitle || word.book_title;

        const highlight = this.highlights.find(h => {
            const matchesBook = h.book_title === bookTitle || h.BookTitle === bookTitle;
            const matchesText = h.text && h.text.toLowerCase().includes(wordText);
            return matchesBook && matchesText;
        });

        if (!highlight || !highlight.text) {
            return '';
        }

        // Extract sentence containing the word
        const sentences = highlight.text.match(/[^.!?]+[.!?]+/g) || [];
        const sentenceWithWord = sentences.find(s =>
            s.toLowerCase().includes(wordText)
        );

        if (sentenceWithWord) {
            return sentenceWithWord.trim();
        }

        // If no sentence found, return first 100 chars of highlight
        return highlight.text.substring(0, 100).trim();
    }

    /**
     * Look up word definition using Free Dictionary API
     */
    async lookupDefinition(word) {
        // Check cache first
        if (this.dictionaryCache.has(word.toLowerCase())) {
            return this.dictionaryCache.get(word.toLowerCase());
        }

        try {
            const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);

            if (!response.ok) {
                return 'Definition not found';
            }

            const data = await response.json();

            if (data && data[0] && data[0].meanings && data[0].meanings[0]) {
                const meaning = data[0].meanings[0];
                const definition = meaning.definitions[0].definition;

                // Cache the result
                this.dictionaryCache.set(word.toLowerCase(), definition);

                return definition;
            }

            return 'Definition not found';
        } catch (error) {
            console.error('Error fetching definition for', word, error);
            return 'Error fetching definition';
        }
    }

    /**
     * Generate preview of flashcards (first 5)
     */
    async generatePreview(options = {}) {
        const {
            includeSentence = true,
            includeSource = true,
            fetchDefinitions = true
        } = options;

        const previewCount = Math.min(5, this.words.length);
        const preview = [];

        for (let i = 0; i < previewCount; i++) {
            const word = this.words[i];
            const definition = fetchDefinitions ? await this.lookupDefinition(word.Text) : 'Fetch definitions to see this';
            const sentence = includeSentence ? this.findSentenceContext(word) : '';
            const source = includeSource ? (word.BookTitle || word.book_title || 'Unknown') : '';

            preview.push({
                front: word.Text,
                back: definition,
                context: sentence,
                source: source
            });
        }

        return preview;
    }

    /**
     * Get statistics about vocabulary
     */
    getStats() {
        const totalWords = this.words.length;
        const uniqueBooks = new Set(this.words.map(w => w.BookTitle || w.book_title)).size;

        // Count words with sentence context
        let wordsWithContext = 0;
        this.words.forEach(word => {
            if (this.findSentenceContext(word)) {
                wordsWithContext++;
            }
        });

        return {
            totalWords,
            uniqueBooks,
            wordsWithContext,
            contextPercentage: Math.round((wordsWithContext / totalWords) * 100)
        };
    }

    /**
     * Escape CSV special characters
     */
    escapeCsv(str) {
        if (!str) return '';
        const strValue = String(str);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
            return strValue.replace(/"/g, '""');
        }
        return strValue;
    }

    /**
     * Get current date string for filenames
     */
    getDateString() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Download file
     */
    downloadFile(filename, content, mimeType = 'text/plain') {
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

/**
 * Advanced Anki Package Export (requires anki-apkg-export library)
 * This is a more advanced feature that creates .apkg files directly
 */
export class AnkiPackageExporter extends FlashcardExporter {
    /**
     * Export to Anki .apkg package
     * Note: Requires anki-apkg-export library to be loaded
     */
    async exportToAnkiPackage(options = {}) {
        const {
            includeSentence = true,
            includeSource = true,
            fetchDefinitions = true,
            deckName = 'Koby Vocabulary'
        } = options;

        // Check if library is available
        if (typeof AnkiExport === 'undefined') {
            console.error('anki-apkg-export library not loaded');
            alert('Anki package export requires additional library. Falling back to CSV export.');
            return this.exportToAnkiCSV(options);
        }

        try {
            const deck = new AnkiExport(deckName);

            for (const word of this.words) {
                const definition = fetchDefinitions ? await this.lookupDefinition(word.Text) : '';
                const sentence = includeSentence ? this.findSentenceContext(word) : '';
                const source = includeSource ? (word.BookTitle || word.book_title || '') : '';

                let back = `<div class="definition">${definition}</div>`;

                if (sentence) {
                    back += `<div class="context"><i>"${sentence}"</i></div>`;
                }

                if (source) {
                    back += `<div class="source">— ${source}</div>`;
                }

                deck.addCard(word.Text, back);
            }

            const zip = await deck.save();
            this.downloadBlob(zip, `koby_vocabulary_${this.getDateString()}.apkg`);

        } catch (error) {
            console.error('Error creating Anki package:', error);
            alert('Error creating Anki package. Please try CSV export instead.');
        }
    }

    /**
     * Download blob
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
