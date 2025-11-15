# Core Integration Features Plan

## Executive Summary

This document outlines Koby's strategic differentiator: becoming **the definitive bridge between Kobo e-readers and users' existing productivity tools**. By focusing on seamless exports, integrations, and sharing, Koby solves the validated pain points of Knowledge Workers, Language Learners, and Social Readers.

**Core Strategy:** Don't compete with Notion/Obsidian/Anki—integrate with them flawlessly.

---

## Strategic Context

### Current Pain Points (Validated by Research)

1. **Knowledge Workers:**
   - Manual copy-pasting of highlights into PKM tools
   - Editing config files to export data
   - Loss of metadata (book title, author, page numbers)
   - Reformatting text for Markdown compatibility

2. **Language Learners:**
   - 5-step process to get vocabulary into Anki
   - No sentence context for words
   - Manual CSV creation and formatting

3. **Social Readers:**
   - Can't share beautiful quote images from e-reader
   - No public links to specific highlights
   - Limited sharing options vs mobile app

### Koby's Value Proposition

> **"Your Kobo highlights, instantly ready for the tools you already love."**

We eliminate friction, not create new destinations.

---

## Tier 1: Core Workflow Integrations

### Feature 1: One-Click PKM Export

#### Overview

**What:** Export highlights to Markdown files optimized for Obsidian, Notion, Logseq, and other PKM tools.

**Why:** Eliminates the #1 pain point for knowledge workers (currently use scripts, manual editing, or paid tools like Readwise).

#### User Flow

```
1. User clicks "Export to PKM" button on profile
2. Selects target format:
   - Obsidian Markdown
   - Notion (via Markdown import)
   - Logseq
   - Roam Research
   - Plain Markdown
3. Chooses export options:
   - All books or selected books
   - Include/exclude annotations
   - Include/exclude metadata
   - Group by book or chronologically
4. Downloads .md file(s) or .zip archive
5. Imports directly into PKM tool
```

#### Export Formats

**Option 1: Obsidian-Optimized Markdown**

```markdown
---
title: "Atomic Habits"
author: "James Clear"
isbn: "9780735211292"
koby_book_id: "file____usr_share_kepub_Atomic_Habits.epub"
date_imported: "2025-11-15"
tags: [books, productivity, habits]
---

# Atomic Habits
**Author:** James Clear
**Last Read:** November 10, 2025
**Reading Progress:** 87%
**Time Spent Reading:** 5h 42m

---

## Highlights & Notes

### Chapter 1: The Surprising Power of Atomic Habits

> [!quote] Page 15 · Highlighted on Nov 3, 2025
> The quality of our lives often depends on the quality of our habits.

**My Note:** This resonates with the compound effect concept. Small changes = big results over time.

---

> [!quote] Page 23 · Highlighted on Nov 3, 2025
> You do not rise to the level of your goals. You fall to the level of your systems.

---

### Chapter 2: How Your Habits Shape Your Identity

> [!quote] Page 31 · Highlighted on Nov 5, 2025
> Every action you take is a vote for the type of person you wish to become.

**My Note:** Identity-based habits > outcome-based goals. [[Identity Change]]

---

## My Words

- **Atomic** (p. 15): An extremely small amount of a thing; the single irreducible unit of a larger system.
  - *Sentence:* "Atomic habits are small habits that are part of a larger system."

- **Compound** (p. 16): A thing that is composed of two or more separate elements.
  - *Sentence:* "The compound effect of tiny improvements over time is remarkable."

---

## Metadata

- **Total Highlights:** 47
- **Total Notes:** 12
- **Total Vocabulary Words:** 23
- **Exported from Koby:** [View on Koby](https://koby.app/user/abc123#book-atomic-habits)
```

**Option 2: Notion-Optimized Markdown**

```markdown
# 📚 Atomic Habits

**Author:** James Clear
**Progress:** 87%
**Time Spent:** 5h 42m
**Last Read:** Nov 10, 2025

---

## ✨ Highlights

### Chapter 1

**"The quality of our lives often depends on the quality of our habits."**
📍 Page 15 · 🗓️ Nov 3, 2025

💭 This resonates with the compound effect concept.

---

**"You do not rise to the level of your goals. You fall to the level of your systems."**
📍 Page 23 · 🗓️ Nov 3, 2025

---

## 📖 Vocabulary

| Word | Definition | Sentence Context |
|------|-----------|------------------|
| Atomic | An extremely small amount | "Atomic habits are small habits..." |
| Compound | Composed of separate elements | "The compound effect of tiny improvements..." |
```

**Option 3: Logseq-Optimized Markdown**

```markdown
- [[Books]] [[Atomic Habits]]
  - Author:: [[James Clear]]
  - Progress:: 87%
  - Time Spent:: 5h 42m
  - Date Last Read:: [[Nov 10th, 2025]]
  - ## Highlights
    - {{[[quote]]}} The quality of our lives often depends on the quality of our habits.
      - Source:: Page 15
      - Date:: [[Nov 3rd, 2025]]
      - My note:: This resonates with the compound effect concept. #insight
    - {{[[quote]]}} You do not rise to the level of your goals. You fall to the level of your systems.
      - Source:: Page 23
      - Date:: [[Nov 3rd, 2025]]
```

#### Implementation

**Frontend UI:**

```javascript
// ExportModal.js
class PKMExporter {
  constructor(userData) {
    this.books = userData.books;
    this.highlights = userData.highlights;
    this.words = userData.words;
  }

  async exportToObsidian(options = {}) {
    const {
      bookIds = 'all',
      includeAnnotations = true,
      includeMetadata = true,
      includeWords = true,
      groupBy = 'book', // 'book' or 'chronological'
      fileStructure = 'single' // 'single' or 'multiple'
    } = options;

    if (fileStructure === 'single') {
      // Export all to one file
      const markdown = this.generateObsidianMarkdown(bookIds, options);
      this.downloadFile(`Koby_Export_${Date.now()}.md`, markdown);
    } else {
      // Export one file per book
      const files = this.generateMultipleFiles(bookIds, options);
      this.downloadZip(files, `Koby_Export_${Date.now()}.zip`);
    }
  }

  generateObsidianMarkdown(bookIds, options) {
    let markdown = '';

    const selectedBooks = bookIds === 'all'
      ? this.books
      : this.books.filter(b => bookIds.includes(b.id));

    selectedBooks.forEach(book => {
      markdown += this.generateBookMarkdown(book, options);
      markdown += '\n\n---\n\n';
    });

    return markdown;
  }

  generateBookMarkdown(book, options) {
    const { includeAnnotations, includeMetadata, includeWords } = options;

    let md = '';

    // Frontmatter
    if (includeMetadata) {
      md += '---\n';
      md += `title: "${book.title}"\n`;
      md += `author: "${book.author}"\n`;
      md += `koby_book_id: "${book.book_id}"\n`;
      md += `date_imported: "${new Date().toISOString().split('T')[0]}"\n`;
      md += 'tags: [books, koby-import]\n';
      md += '---\n\n';
    }

    // Title and metadata
    md += `# ${book.title}\n`;
    md += `**Author:** ${book.author}\n`;
    if (book.percent_read) md += `**Reading Progress:** ${Math.round(book.percent_read * 100)}%\n`;
    if (book.time_spent_reading) md += `**Time Spent Reading:** ${this.formatDuration(book.time_spent_reading)}\n`;
    md += '\n---\n\n';

    // Highlights
    const bookHighlights = this.highlights.filter(h => h.book_id === book.book_id);
    if (bookHighlights.length > 0) {
      md += '## Highlights & Notes\n\n';

      bookHighlights.forEach(highlight => {
        md += `> [!quote] ${highlight.date_created ? new Date(highlight.date_created).toLocaleDateString() : ''}\n`;
        md += `> ${highlight.text.replace(/\n/g, '\n> ')}\n\n`;

        if (includeAnnotations && highlight.annotation) {
          md += `**My Note:** ${highlight.annotation}\n\n`;
        }

        md += '---\n\n';
      });
    }

    // Vocabulary words
    if (includeWords) {
      const bookWords = this.words.filter(w => w.BookTitle === book.title);
      if (bookWords.length > 0) {
        md += '## My Words\n\n';
        bookWords.forEach(word => {
          md += `- **${word.Text}**\n`;
          if (word.sentence) md += `  - *Sentence:* "${word.sentence}"\n`;
          md += '\n';
        });
      }
    }

    return md;
  }

  downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async downloadZip(files, zipName) {
    // Use JSZip library
    const zip = new JSZip();
    files.forEach(({ filename, content }) => {
      zip.file(filename, content);
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    a.click();
    URL.revokeObjectURL(url);
  }

  formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  }
}
```

**UI Components:**

```html
<!-- Export Modal -->
<div class="export-modal">
  <h2>Export to PKM Tool</h2>

  <!-- Format Selection -->
  <div class="format-selector">
    <label>
      <input type="radio" name="format" value="obsidian" checked>
      <span>Obsidian</span>
    </label>
    <label>
      <input type="radio" name="format" value="notion">
      <span>Notion</span>
    </label>
    <label>
      <input type="radio" name="format" value="logseq">
      <span>Logseq</span>
    </label>
    <label>
      <input type="radio" name="format" value="markdown">
      <span>Plain Markdown</span>
    </label>
  </div>

  <!-- Book Selection -->
  <div class="book-selector">
    <label>
      <input type="radio" name="books" value="all" checked>
      <span>All Books ({{bookCount}})</span>
    </label>
    <label>
      <input type="radio" name="books" value="selected">
      <span>Select Books</span>
    </label>
    <div class="book-list" style="display: none;">
      <!-- Checkboxes for each book -->
    </div>
  </div>

  <!-- Export Options -->
  <div class="export-options">
    <label>
      <input type="checkbox" checked> Include highlights
    </label>
    <label>
      <input type="checkbox" checked> Include my notes
    </label>
    <label>
      <input type="checkbox" checked> Include vocabulary words
    </label>
    <label>
      <input type="checkbox" checked> Include metadata
    </label>
  </div>

  <!-- File Structure -->
  <div class="file-structure">
    <label>
      <input type="radio" name="structure" value="single" checked>
      <span>Single file (all books)</span>
    </label>
    <label>
      <input type="radio" name="structure" value="multiple">
      <span>One file per book (.zip)</span>
    </label>
  </div>

  <!-- Actions -->
  <div class="modal-actions">
    <button class="btn-secondary" onclick="closeExportModal()">Cancel</button>
    <button class="btn-primary" onclick="exportData()">Export</button>
  </div>
</div>
```

#### Analytics

Track export usage to prioritize format improvements:

```javascript
logEvent(analytics, 'export_pkm', {
  format: 'obsidian',
  book_count: 5,
  highlight_count: 127,
  file_structure: 'single',
  includes_notes: true,
  includes_words: true
});
```

---

### Feature 2: Automated Flashcard Creation

#### Overview

**What:** One-click export of "My Words" vocabulary to flashcard apps (Anki, Quizlet, Brainscape).

**Why:** Eliminates 5-step manual process for language learners.

#### User Flow

```
1. User navigates to "My Words" tab
2. Clicks "Export to Flashcards" button
3. Selects format:
   - Anki (.apkg file)
   - Anki CSV (for AnkiWeb import)
   - Quizlet (text format)
   - CSV (universal)
4. Chooses options:
   - Include sentence context
   - Include book title
   - Front/back configuration
5. Downloads file
6. Imports to flashcard app
```

#### Flashcard Formats

**Anki CSV Format:**

```csv
"Front","Back","Context","Source"
"Serendipity","The occurrence of events by chance in a happy way","The serendipity of finding this book changed my perspective.","Atomic Habits"
"Pragmatic","Dealing with things sensibly and realistically","We need a pragmatic approach to this problem.","Thinking, Fast and Slow"
```

**Anki Note Type Configuration:**

```
Note Type: Koby Vocabulary
Fields:
  - Word (Front)
  - Definition (Back)
  - Sentence Context
  - Source Book
  - Date Added

Card Template:
  Front: {{Word}}
  Back: {{Definition}}<br><br><i>"{{Sentence Context}}"</i><br><br>— {{Source Book}}
```

**Quizlet Format:**

```
Serendipity	The occurrence of events by chance in a happy way
Pragmatic	Dealing with things sensibly and realistically
```

#### Implementation

**Frontend:**

```javascript
class FlashcardExporter {
  constructor(words, highlights) {
    this.words = words;
    this.highlights = highlights;
  }

  async exportToAnkiCSV(options = {}) {
    const { includeSentence = true, includeSource = true } = options;

    let csv = '"Front","Back"';
    if (includeSentence) csv += ',"Context"';
    if (includeSource) csv += ',"Source"';
    csv += '\n';

    for (const word of this.words) {
      const definition = await this.lookupDefinition(word.Text);
      const sentence = includeSentence ? this.findSentenceContext(word) : '';

      csv += `"${this.escapeCsv(word.Text)}",`;
      csv += `"${this.escapeCsv(definition)}"`;
      if (includeSentence) csv += `,"${this.escapeCsv(sentence)}"`;
      if (includeSource) csv += `,"${this.escapeCsv(word.BookTitle)}"`;
      csv += '\n';
    }

    this.downloadFile('koby_vocabulary.csv', csv);
  }

  findSentenceContext(word) {
    // Find the highlight containing this word
    const highlight = this.highlights.find(h =>
      h.text.toLowerCase().includes(word.Text.toLowerCase()) &&
      h.book_title === word.BookTitle
    );

    if (!highlight) return '';

    // Extract sentence containing the word
    const sentences = highlight.text.match(/[^.!?]+[.!?]+/g) || [];
    const sentenceWithWord = sentences.find(s =>
      s.toLowerCase().includes(word.Text.toLowerCase())
    );

    return sentenceWithWord ? sentenceWithWord.trim() : highlight.text;
  }

  async lookupDefinition(word) {
    // Option 1: Use Free Dictionary API
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      const data = await response.json();
      return data[0]?.meanings[0]?.definitions[0]?.definition || 'No definition found';
    } catch (e) {
      return 'No definition found';
    }

    // Option 2: Extract from Kobo WordList table (if available)
    // The WordList table sometimes contains definitions
  }

  async exportToAnkiPackage(options = {}) {
    // Generate .apkg file (requires anki-apkg-export library)
    const { default: AnkiExport } = await import('anki-apkg-export');

    const deck = new AnkiExport('Koby Vocabulary');

    for (const word of this.words) {
      const definition = await this.lookupDefinition(word.Text);
      const sentence = this.findSentenceContext(word);

      deck.addCard(word.Text, `${definition}<br><br><i>"${sentence}"</i><br><br>— ${word.BookTitle}`);
    }

    const zip = await deck.save();
    this.downloadBlob(zip, 'koby_vocabulary.apkg');
  }

  exportToQuizlet() {
    let text = '';
    this.words.forEach(async word => {
      const definition = await this.lookupDefinition(word.Text);
      text += `${word.Text}\t${definition}\n`;
    });

    this.downloadFile('koby_quizlet.txt', text);
  }

  escapeCsv(str) {
    if (!str) return '';
    return str.replace(/"/g, '""');
  }

  downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
```

**UI Component:**

```html
<div class="flashcard-export-modal">
  <h2>Export to Flashcards</h2>

  <div class="format-selector">
    <label>
      <input type="radio" name="format" value="anki-csv" checked>
      <span>Anki CSV</span>
      <small>Import to AnkiWeb or desktop app</small>
    </label>
    <label>
      <input type="radio" name="format" value="anki-apkg">
      <span>Anki Package (.apkg)</span>
      <small>Direct import with formatting</small>
    </label>
    <label>
      <input type="radio" name="format" value="quizlet">
      <span>Quizlet</span>
      <small>Copy-paste into Quizlet</small>
    </label>
  </div>

  <div class="export-options">
    <label>
      <input type="checkbox" checked> Include sentence context
      <small>Show the word used in a sentence from your highlights</small>
    </label>
    <label>
      <input type="checkbox" checked> Include source book
      <small>Show which book the word came from</small>
    </label>
    <label>
      <input type="checkbox" checked> Fetch definitions
      <small>Automatically look up definitions (may take a moment)</small>
    </label>
  </div>

  <div class="preview">
    <h3>Preview</h3>
    <div class="flashcard-preview">
      <div class="card-front">Serendipity</div>
      <div class="card-back">
        <p>The occurrence of events by chance in a happy way</p>
        <p><i>"The serendipity of finding this book changed everything."</i></p>
        <p>— Atomic Habits</p>
      </div>
    </div>
  </div>

  <div class="stats">
    <p>Ready to export <strong>{{wordCount}}</strong> words</p>
  </div>

  <div class="modal-actions">
    <button class="btn-secondary" onclick="closeFlashcardModal()">Cancel</button>
    <button class="btn-primary" onclick="exportFlashcards()">Export</button>
  </div>
</div>
```

#### Enhancement: Spaced Repetition Integration

**Future Feature:** Direct API integration with Anki

```javascript
// Use AnkiConnect API (requires Anki desktop app running)
async function addToAnkiDirect(word, definition, sentence, source) {
  const ankiConnectUrl = 'http://localhost:8765';

  const payload = {
    action: 'addNote',
    version: 6,
    params: {
      note: {
        deckName: 'Koby Vocabulary',
        modelName: 'Basic',
        fields: {
          Front: word,
          Back: `${definition}<br><br><i>"${sentence}"</i><br><br>— ${source}`
        },
        tags: ['koby', 'vocabulary']
      }
    }
  };

  const response = await fetch(ankiConnectUrl, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return await response.json();
}
```

---

### Feature 3: Instant Quote Sharing

#### Overview

**What:** Generate beautiful, shareable images of quotes + create unique public links to highlights.

**Why:** Solves the #1 pain point for social readers (can't share from e-reader, unlike mobile app).

#### Component A: Quote Images

**Design Options:**

1. **Minimalist Style:**
   ```
   ┌─────────────────────────────────────┐
   │                                     │
   │  "The quality of our lives often    │
   │   depends on the quality of our     │
   │   habits."                          │
   │                                     │
   │   — James Clear, Atomic Habits      │
   │                                     │
   │   📚 via Koby                       │
   └─────────────────────────────────────┘
   ```

2. **Book Cover Style:**
   ```
   ┌─────────────────────────────────────┐
   │  [Book Cover Thumbnail]             │
   │                                     │
   │  "The quality of our lives often    │
   │   depends on the quality of our     │
   │   habits."                          │
   │                                     │
   │  — Atomic Habits by James Clear     │
   │                                     │
   │  Shared by @alice on Koby          │
   └─────────────────────────────────────┘
   ```

3. **Color-Coded Style:**
   ```
   ┌─────────────────────────────────────┐
   │ [Yellow highlight bar]              │
   │                                     │
   │  "The quality of our lives often    │
   │   depends on the quality of our     │
   │   habits."                          │
   │                                     │
   │  — James Clear                      │
   └─────────────────────────────────────┘
   ```

**Implementation:**

**Option 1: Canvas API (Client-Side)**

```javascript
class QuoteImageGenerator {
  constructor(highlight, book, user) {
    this.highlight = highlight;
    this.book = book;
    this.user = user;
  }

  async generate(style = 'minimalist') {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630; // Optimal for social media (Open Graph)
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#f8f9fa');
    gradient.addColorStop(1, '#e9ecef');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Quote text
    ctx.fillStyle = '#212529';
    ctx.font = 'bold 48px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = 1000;
    const lineHeight = 60;
    const lines = this.wrapText(ctx, `"${this.highlight.text}"`, maxWidth);

    lines.forEach((line, index) => {
      const y = canvas.height / 2 - (lines.length * lineHeight) / 2 + index * lineHeight;
      ctx.fillText(line, canvas.width / 2, y);
    });

    // Attribution
    ctx.font = '32px -apple-system, sans-serif';
    ctx.fillStyle = '#6c757d';
    const attribution = `— ${this.book.author}, ${this.book.title}`;
    ctx.fillText(attribution, canvas.width / 2, canvas.height - 120);

    // Koby branding
    ctx.font = '24px -apple-system, sans-serif';
    ctx.fillStyle = '#adb5bd';
    ctx.fillText('📚 via Koby', canvas.width / 2, canvas.height - 60);

    // Convert to image
    return canvas.toDataURL('image/png');
  }

  wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + ' ' + word).width;
      if (width < maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  }

  async downloadImage() {
    const dataUrl = await this.generate();
    const link = document.createElement('a');
    link.download = `koby-quote-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }

  async shareToSocial() {
    const dataUrl = await this.generate();

    // Convert data URL to blob
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'quote.png', { type: 'image/png' });

    // Use Web Share API
    if (navigator.share) {
      await navigator.share({
        title: `Quote from ${this.book.title}`,
        text: this.highlight.text,
        files: [file]
      });
    }
  }
}
```

**Option 2: Server-Side Generation (Better Quality)**

Use Cloud Function with Puppeteer or Sharp library:

```javascript
// functions/generateQuoteImage.js
const functions = require('firebase-functions');
const puppeteer = require('puppeteer');

exports.generateQuoteImage = functions.https.onCall(async (data, context) => {
  const { highlightId, userId, style } = data;

  // Fetch highlight data
  const highlightDoc = await admin.firestore()
    .doc(`users/${userId}/highlights/${highlightId}`)
    .get();

  const highlight = highlightDoc.data();

  // Generate HTML template
  const html = renderQuoteTemplate(highlight, style);

  // Launch headless browser
  const browser = await puppeteer.launch({
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });
  await page.setContent(html);

  // Take screenshot
  const screenshot = await page.screenshot({ type: 'png' });
  await browser.close();

  // Upload to Cloud Storage
  const bucket = admin.storage().bucket();
  const filename = `quote-images/${userId}/${highlightId}.png`;
  const file = bucket.file(filename);

  await file.save(screenshot, {
    metadata: { contentType: 'image/png' },
    public: true
  });

  return { imageUrl: file.publicUrl() };
});

function renderQuoteTemplate(highlight, style) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 0;
          width: 1200px;
          height: 630px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: Georgia, serif;
        }
        .quote {
          font-size: 48px;
          color: white;
          text-align: center;
          max-width: 1000px;
          padding: 0 50px;
          line-height: 1.4;
        }
        .attribution {
          font-size: 32px;
          color: rgba(255, 255, 255, 0.8);
          margin-top: 40px;
        }
      </style>
    </head>
    <body>
      <div class="quote">"${highlight.text}"</div>
      <div class="attribution">— ${highlight.author}, ${highlight.bookTitle}</div>
    </body>
    </html>
  `;
}
```

**UI Component:**

```html
<div class="quote-share-options">
  <button onclick="generateQuoteImage()">
    <i class="fas fa-image"></i> Create Image
  </button>
  <button onclick="copyPublicLink()">
    <i class="fas fa-link"></i> Copy Link
  </button>
  <button onclick="shareToTwitter()">
    <i class="fab fa-twitter"></i> Share
  </button>
</div>

<!-- Image Preview Modal -->
<div class="image-preview-modal" style="display: none;">
  <h2>Your Quote Image</h2>
  <canvas id="quote-canvas"></canvas>

  <div class="style-selector">
    <button class="style-btn active" data-style="minimalist">Minimalist</button>
    <button class="style-btn" data-style="gradient">Gradient</button>
    <button class="style-btn" data-style="book-cover">Book Cover</button>
  </div>

  <div class="actions">
    <button onclick="downloadQuoteImage()">Download</button>
    <button onclick="shareQuoteImage()">Share</button>
    <button onclick="copyImageToClipboard()">Copy to Clipboard</button>
  </div>
</div>
```

#### Component B: Public Highlight Links

**Feature:** Unique, shareable URLs for individual highlights

**URL Structure:**
```
https://koby.app/h/{highlightId}
https://koby.app/highlight/{userId}/{highlightId}
```

**Implementation:**

**Firestore Structure:**
```firestore
/publicHighlights/{shortId}
  - userId: string
  - highlightId: string
  - createdAt: Timestamp
  - viewCount: number
```

**Cloud Function to Generate Short URLs:**

```javascript
exports.createPublicHighlightLink = functions.https.onCall(async (data, context) => {
  const { userId, highlightId } = data;

  // Generate short ID
  const shortId = generateShortId(); // e.g., "abc123"

  await admin.firestore().doc(`publicHighlights/${shortId}`).set({
    userId,
    highlightId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    viewCount: 0
  });

  return {
    shortUrl: `https://koby.app/h/${shortId}`,
    fullUrl: `https://koby.app/highlight/${userId}/${highlightId}`
  };
});

function generateShortId() {
  return Math.random().toString(36).substring(2, 8);
}
```

**Public Highlight Page:**

```html
<!-- h.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Koby Highlight</title>
  <!-- Open Graph meta tags for rich previews -->
  <meta property="og:title" content="Quote from {{bookTitle}}">
  <meta property="og:description" content="{{highlightText}}">
  <meta property="og:image" content="{{quoteImageUrl}}">
  <meta property="og:url" content="https://koby.app/h/{{shortId}}">
  <meta name="twitter:card" content="summary_large_image">
</head>
<body>
  <div class="highlight-page">
    <div class="quote-card">
      <blockquote>
        "{{highlightText}}"
      </blockquote>
      <p class="attribution">
        — {{author}}, <i>{{bookTitle}}</i>
      </p>
      <p class="shared-by">
        Shared by <a href="/user/{{userId}}">@{{nickname}}</a> on Koby
      </p>
    </div>

    <div class="cta">
      <h2>Track Your Reading Highlights</h2>
      <p>Upload your Kobo database and see all your highlights, notes, and reading stats.</p>
      <a href="/upload.html" class="btn-primary">Try Koby Free</a>
    </div>
  </div>
</body>
</html>
```

**Share Button Functionality:**

```javascript
async function shareHighlight(highlightId, userId) {
  // Generate public link
  const { shortUrl } = await createPublicHighlightLink(userId, highlightId);

  // Use Web Share API if available
  if (navigator.share) {
    await navigator.share({
      title: `Quote from ${highlight.bookTitle}`,
      text: highlight.text,
      url: shortUrl
    });
  } else {
    // Fallback: Copy to clipboard
    await navigator.clipboard.writeText(shortUrl);
    showToast('Link copied to clipboard!');
  }

  // Analytics
  logEvent(analytics, 'share_highlight', {
    method: 'link',
    highlight_id: highlightId
  });
}
```

---

## Success Metrics

### Tier 1 Features

| Feature | Key Metric | Target |
|---------|-----------|--------|
| PKM Export | % of users who export | 40% |
| PKM Export | Average exports per user | 2/month |
| Flashcard Export | % of users with vocabulary who export | 60% |
| Quote Images | Images generated per week | 1000+ |
| Public Links | Shares per highlight | 0.05 (1 in 20) |

### User Satisfaction

- [ ] 80%+ of survey respondents rate export quality as "Good" or "Excellent"
- [ ] <5% support requests related to export issues
- [ ] Positive mentions in PKM community forums (Reddit, Discord)

---

## Implementation Timeline

### Week 1-2: PKM Export
- [ ] Build Markdown generator
- [ ] Create export UI modal
- [ ] Support Obsidian, Notion, Logseq formats
- [ ] Add JSZip for multi-file exports
- [ ] Test with real user data

### Week 3-4: Flashcard Export
- [ ] Build CSV exporter
- [ ] Integrate dictionary API
- [ ] Add sentence context extraction
- [ ] Support Anki and Quizlet formats
- [ ] Create preview UI

### Week 5-6: Quote Sharing
- [ ] Build Canvas-based image generator
- [ ] Create style templates
- [ ] Add public highlight link system
- [ ] Implement Open Graph meta tags
- [ ] Add Web Share API integration

---

## Future Enhancements

### Advanced Integrations

1. **Direct API Integrations:**
   - Notion API (write highlights directly to Notion database)
   - Obsidian Sync API (when available)
   - ReadCube/Paperpile for academic users

2. **Bi-Directional Sync:**
   - Edit highlights in Koby or PKM tool, sync both ways
   - Real-time collaboration on annotations

3. **AI-Powered Features:**
   - Auto-generate summaries of books from highlights
   - Suggest connections between highlights across books
   - Smart tagging based on highlight content

4. **Browser Extension:**
   - Capture web highlights
   - Sync with Kobo highlights
   - Unified PKM export

---

*Last Updated: 2025-11-15*
