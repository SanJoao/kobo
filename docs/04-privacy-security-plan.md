# Privacy & Security Plan

## Executive Summary

Privacy is a core differentiator for Koby against competitors like Readwise (cloud-dependent) and Goodreads (data mining concerns). This plan outlines how to build trust through **offline-first processing, granular privacy controls, and transparent data practices**.

**Core Principle:** *"Your reading data belongs to you. Period."*

---

## Current State Analysis

### What We Have ✅
- Firebase Authentication (Google OAuth)
- Basic Firestore security rules (user-scoped writes)
- Public-by-default highlights
- Data stored in user's Firebase account

### Critical Gaps ❌
- **No offline processing option** - All uploads go to cloud
- **No privacy controls** - Everything is public
- **No data export** - Users can't download their data
- **No data deletion** - No clear account deletion process
- **Unclear privacy policy** - No transparency about data usage
- **No encryption** - Data stored in plaintext
- **No audit logs** - Can't see who accessed your data

---

## Strategic Approach

### Privacy Tiers

**Tier 1: Offline-First Mode** (Local Processing)
- Process SQLite file entirely in browser
- Zero data uploaded to servers
- Limited social features
- Export to PKM tools only

**Tier 2: Private Account** (Cloud Storage, Private Visibility)
- Data stored in Firestore
- No public profile
- No social features
- Full analytics and sync

**Tier 3: Semi-Public Account** (Selective Sharing)
- Data stored in Firestore
- Public profile
- Choose which highlights/books are public
- Full social features with granular controls

**Tier 4: Fully Public Account** (Current Behavior)
- All highlights public
- Full social features
- Maximum discoverability

---

## Feature Design

### Phase 1: Offline-First Mode (Weeks 1-3)

#### 1.1 Client-Side SQLite Processing

**Architecture:**

```
┌─────────────┐
│   Browser   │
│             │
│ ┌─────────┐ │
│ │ Worker  │ │  Process SQLite
│ │ Thread  │ │  Extract data
│ └─────────┘ │  Generate exports
│      │      │
│      ▼      │
│ ┌─────────┐ │
│ │ IndexedDB│ │  Cache locally
│ └─────────┘ │
└─────────────┘

NO DATA SENT TO SERVER
```

**Implementation:**

**Step 1: Use sql.js (SQLite compiled to WebAssembly)**

```html
<!-- upload.html -->
<script src="https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.js"></script>

<script>
// Initialize sql.js
let SQL;
async function initSqlJs() {
  SQL = await initSqlJs({
    locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/${file}`
  });
}
</script>
```

**Step 2: Process File in Browser**

```javascript
class OfflineProcessor {
  constructor() {
    this.db = null;
    this.data = {
      books: [],
      highlights: [],
      words: []
    };
  }

  async processFile(file) {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Load into sql.js
    this.db = new SQL.Database(uint8Array);

    // Extract data (same queries as Cloud Function)
    await this.extractBooks();
    await this.extractHighlights();
    await this.extractWords();

    // Store in IndexedDB (optional, for persistence)
    await this.saveToIndexedDB();

    return this.data;
  }

  extractBooks() {
    const query = `
      SELECT DISTINCT
        BookID,
        BookTitle,
        Attribution AS author,
        Description
      FROM content
      WHERE ContentType = 6
        AND BookTitle IS NOT NULL
    `;

    const result = this.db.exec(query);
    if (result.length === 0) return;

    const rows = result[0].values;
    this.data.books = rows.map(row => ({
      book_id: row[0],
      title: row[1],
      author: row[2],
      description: row[3]
    }));
  }

  extractHighlights() {
    const query = `
      SELECT
        b.Text AS highlight_text,
        b.Annotation,
        b.DateCreated,
        c.BookTitle,
        c.Attribution AS author,
        b.Color
      FROM Bookmark b
      JOIN content c ON b.VolumeID = c.BookID
      WHERE b.Text IS NOT NULL
      ORDER BY b.DateCreated DESC
    `;

    const result = this.db.exec(query);
    if (result.length === 0) return;

    const rows = result[0].values;
    this.data.highlights = rows.map(row => ({
      text: row[0],
      annotation: row[1],
      date_created: row[2],
      book_title: row[3],
      author: row[4],
      color: row[5]
    }));
  }

  extractWords() {
    const query = `
      SELECT Text, DateCreated
      FROM WordList
      ORDER BY DateCreated DESC
    `;

    const result = this.db.exec(query);
    if (result.length === 0) return;

    const rows = result[0].values;
    this.data.words = rows.map(row => ({
      text: row[0],
      date_created: row[1]
    }));
  }

  async saveToIndexedDB() {
    const dbName = 'KobyOfflineDB';
    const request = indexedDB.open(dbName, 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('data')) {
        db.createObjectStore('data');
      }
    };

    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['data'], 'readwrite');
        const store = transaction.objectStore('data');

        store.put(this.data.books, 'books');
        store.put(this.data.highlights, 'highlights');
        store.put(this.data.words, 'words');
        store.put(Date.now(), 'lastUpdated');

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };

      request.onerror = () => reject(request.error);
    });
  }
}
```

**Step 3: UI for Mode Selection**

```html
<div class="upload-mode-selector">
  <h2>Choose Your Privacy Level</h2>

  <div class="mode-card">
    <input type="radio" name="mode" value="offline" id="mode-offline" checked>
    <label for="mode-offline">
      <h3>🔒 Offline Mode (Maximum Privacy)</h3>
      <p>Process your data entirely in your browser. Nothing uploaded to our servers.</p>
      <ul>
        <li>✅ Complete privacy</li>
        <li>✅ Export to PKM tools</li>
        <li>✅ Local analytics</li>
        <li>❌ No cloud sync</li>
        <li>❌ No social features</li>
      </ul>
    </label>
  </div>

  <div class="mode-card">
    <input type="radio" name="mode" value="private" id="mode-private">
    <label for="mode-private">
      <h3>🔐 Private Account</h3>
      <p>Store your data securely in the cloud. Your profile and highlights are private.</p>
      <ul>
        <li>✅ Cloud sync across devices</li>
        <li>✅ Full analytics</li>
        <li>✅ Privacy guaranteed</li>
        <li>❌ No public profile</li>
        <li>❌ Limited social features</li>
      </ul>
    </label>
  </div>

  <div class="mode-card">
    <input type="radio" name="mode" value="public" id="mode-public">
    <label for="mode-public">
      <h3>🌍 Public Account</h3>
      <p>Share your reading journey. Connect with other readers.</p>
      <ul>
        <li>✅ Public profile</li>
        <li>✅ Social features</li>
        <li>✅ Discover readers</li>
        <li>⚠️ Highlights visible to all</li>
      </ul>
    </label>
  </div>

  <button class="btn-primary" onclick="proceedWithUpload()">Continue</button>
</div>
```

**Step 4: Offline Mode UI**

After processing offline, show local dashboard:

```javascript
class OfflineDashboard {
  constructor(data) {
    this.data = data;
  }

  render() {
    // Same UI as online mode, but:
    // - No like buttons
    // - No follow features
    // - No public sharing
    // - Add "Upload to Cloud" button (to upgrade to private/public mode)

    document.getElementById('stats').innerHTML = `
      <div class="stat-card">
        <h3>${this.data.books.length}</h3>
        <p>Books</p>
      </div>
      <div class="stat-card">
        <h3>${this.data.highlights.length}</h3>
        <p>Highlights</p>
      </div>
      <div class="stat-card">
        <h3>${this.data.words.length}</h3>
        <p>Words</p>
      </div>
    `;

    // Render charts, highlights, etc.
    this.renderCharts();
    this.renderHighlights();
  }

  // Export functionality works the same
  async exportToPKM(format) {
    const exporter = new PKMExporter(this.data);
    await exporter.exportToObsidian({ format });
  }
}
```

---

#### 1.2 Granular Privacy Controls

**User Privacy Settings Schema:**

```firestore
/users/{userId}/settings/privacy
  - profileVisibility: 'public' | 'private' | 'unlisted'
  - defaultHighlightVisibility: 'public' | 'followers_only' | 'private'
  - showFollowerCounts: boolean
  - showReadingStats: boolean
  - showLikedHighlights: boolean
  - showVocabularyWords: boolean
  - allowFollowers: boolean
  - requireFollowApproval: boolean
  - allowDirectMessages: boolean
  - whoCanMessage: 'anyone' | 'followers' | 'none'
  - whoCanComment: 'anyone' | 'followers' | 'none'
  - showInDiscovery: boolean
  - emailNotifications: boolean
  - searchable: boolean
```

**Per-Highlight Privacy:**

```firestore
/users/{userId}/highlights/{highlightId}
  - visibility: 'public' | 'followers_only' | 'private'
  - allowComments: boolean
```

**Per-Book Privacy:**

```firestore
/users/{userId}/books/{bookId}
  - visibility: 'public' | 'followers_only' | 'private'
```

**Privacy Settings UI:**

```html
<div class="privacy-settings">
  <h2>Privacy Settings</h2>

  <section>
    <h3>Profile Visibility</h3>
    <label>
      <input type="radio" name="profile" value="public" checked>
      Public - Anyone can find and view your profile
    </label>
    <label>
      <input type="radio" name="profile" value="unlisted">
      Unlisted - Only people with the link can view
    </label>
    <label>
      <input type="radio" name="profile" value="private">
      Private - Only you can view
    </label>
  </section>

  <section>
    <h3>Default Highlight Visibility</h3>
    <label>
      <input type="radio" name="highlights" value="public" checked>
      Public - Visible to everyone
    </label>
    <label>
      <input type="radio" name="highlights" value="followers_only">
      Followers Only - Only people who follow you
    </label>
    <label>
      <input type="radio" name="highlights" value="private">
      Private - Only visible to you
    </label>
  </section>

  <section>
    <h3>What Others Can See</h3>
    <label>
      <input type="checkbox" checked> Follower/Following counts
    </label>
    <label>
      <input type="checkbox" checked> Reading statistics
    </label>
    <label>
      <input type="checkbox" checked> Liked highlights
    </label>
    <label>
      <input type="checkbox" checked> Vocabulary words
    </label>
  </section>

  <section>
    <h3>Social Interactions</h3>
    <label>
      <input type="checkbox" checked> Allow others to follow me
    </label>
    <label>
      <input type="checkbox"> Require approval for new followers
    </label>
    <label>
      <input type="checkbox" checked> Allow direct messages
    </label>
    <select name="whoCanMessage">
      <option value="anyone">Anyone can message me</option>
      <option value="followers" selected>Only followers can message me</option>
      <option value="none">No one can message me</option>
    </select>
  </section>

  <section>
    <h3>Discovery</h3>
    <label>
      <input type="checkbox" checked> Show my profile in "Readers Like You" suggestions
    </label>
    <label>
      <input type="checkbox" checked> Allow others to find me by email
    </label>
  </section>

  <button class="btn-primary" onclick="savePrivacySettings()">Save Settings</button>
</div>
```

**Firestore Security Rules:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }

    function isPublic(userId) {
      let settings = get(/databases/$(database)/documents/users/$(userId)/settings/privacy).data;
      return settings.profileVisibility == 'public';
    }

    function isFollower(userId) {
      return request.auth != null &&
        exists(/databases/$(database)/documents/users/$(userId)/followers/$(request.auth.uid));
    }

    function canViewProfile(userId) {
      let settings = get(/databases/$(database)/documents/users/$(userId)/settings/privacy).data;
      return settings.profileVisibility == 'public'
        || (settings.profileVisibility == 'unlisted')
        || isOwner(userId);
    }

    function canViewHighlight(userId, highlight) {
      return highlight.visibility == 'public'
        || (highlight.visibility == 'followers_only' && isFollower(userId))
        || isOwner(userId);
    }

    // User documents
    match /users/{userId} {
      allow read: if canViewProfile(userId);
      allow write: if isOwner(userId);

      // Privacy settings
      match /settings/privacy {
        allow read: if isOwner(userId);
        allow write: if isOwner(userId);
      }

      // Books
      match /books/{bookId} {
        allow read: if canViewProfile(userId);
        allow write: if isOwner(userId);
      }

      // Highlights
      match /highlights/{highlightId} {
        allow read: if canViewHighlight(userId, resource.data);
        allow create: if isOwner(userId);
        allow update: if isOwner(userId)
          || (request.auth != null && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes', 'likeCount']));
        allow delete: if isOwner(userId);
      }

      // Followers/Following
      match /followers/{followerId} {
        allow read: if canViewProfile(userId);
        allow write: if request.auth.uid == followerId;
      }

      match /following/{followedId} {
        allow read: if canViewProfile(userId);
        allow write: if isOwner(userId);
      }
    }

    // Public highlights collection (for discovery)
    match /publicHighlights/{highlightId} {
      allow read: if true;
      allow write: if false; // Only Cloud Functions can write
    }
  }
}
```

---

### Phase 2: Data Control & Transparency (Weeks 4-6)

#### 2.1 Data Export (GDPR Compliance)

**Feature:** Download all your data in standard formats

**Export Options:**

1. **JSON Export** (machine-readable)
2. **CSV Export** (spreadsheet-compatible)
3. **Markdown Export** (human-readable)

**Data Included:**
- Profile information
- Books
- Highlights & annotations
- Vocabulary words
- Liked highlights
- Followers/following lists
- Activity history
- Privacy settings

**Implementation:**

```javascript
class DataExporter {
  async exportAllData(userId) {
    // Fetch all user data
    const userData = await this.fetchAllUserData(userId);

    return {
      profile: userData.profile,
      books: userData.books,
      highlights: userData.highlights,
      words: userData.words,
      likedHighlights: userData.likedHighlights,
      followers: userData.followers,
      following: userData.following,
      settings: userData.settings,
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0'
    };
  }

  async downloadJSON(userId) {
    const data = await this.exportAllData(userId);
    const json = JSON.stringify(data, null, 2);
    this.downloadFile(`koby_data_${userId}.json`, json, 'application/json');
  }

  async downloadCSVArchive(userId) {
    const data = await this.exportAllData(userId);

    const files = {
      'books.csv': this.convertToCSV(data.books),
      'highlights.csv': this.convertToCSV(data.highlights),
      'words.csv': this.convertToCSV(data.words),
      'liked_highlights.csv': this.convertToCSV(data.likedHighlights),
      'followers.csv': this.convertToCSV(data.followers),
      'following.csv': this.convertToCSV(data.following)
    };

    const zip = new JSZip();
    Object.entries(files).forEach(([filename, content]) => {
      zip.file(filename, content);
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    this.downloadBlob(blob, `koby_data_${userId}.zip`);
  }

  convertToCSV(data) {
    if (!data || data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(header => JSON.stringify(row[header] || '')).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }
}
```

**UI:**

```html
<div class="data-export-section">
  <h2>Export Your Data</h2>
  <p>Download all your data from Koby. This includes your books, highlights, notes, and settings.</p>

  <div class="export-options">
    <button onclick="exportJSON()">
      <i class="fas fa-code"></i>
      Download as JSON
      <small>Machine-readable format</small>
    </button>
    <button onclick="exportCSV()">
      <i class="fas fa-table"></i>
      Download as CSV
      <small>Open in Excel or Google Sheets</small>
    </button>
    <button onclick="exportMarkdown()">
      <i class="fas fa-file-alt"></i>
      Download as Markdown
      <small>Human-readable text files</small>
    </button>
  </div>

  <p class="privacy-note">
    <i class="fas fa-info-circle"></i>
    This export includes all your data. Keep it safe!
  </p>
</div>
```

---

#### 2.2 Account Deletion

**Feature:** Permanently delete account and all data

**What Gets Deleted:**
- User profile
- All books, highlights, words
- All follows/followers relationships
- All comments and likes
- All uploaded files in Cloud Storage
- All activity feed items
- All notifications

**Implementation:**

```javascript
// Cloud Function for complete account deletion
exports.deleteAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const userId = context.auth.uid;

  // Step 1: Delete all subcollections
  await deleteCollection(`users/${userId}/books`, 100);
  await deleteCollection(`users/${userId}/highlights`, 100);
  await deleteCollection(`users/${userId}/words`, 100);
  await deleteCollection(`users/${userId}/followers`, 100);
  await deleteCollection(`users/${userId}/following`, 100);
  await deleteCollection(`users/${userId}/notifications`, 100);
  await deleteCollection(`users/${userId}/settings`, 100);

  // Step 2: Delete user from others' followers lists
  const followingSnap = await db.collection(`users/${userId}/following`).get();
  const batch = db.batch();
  followingSnap.docs.forEach(doc => {
    batch.delete(db.doc(`users/${doc.id}/followers/${userId}`));
  });
  await batch.commit();

  // Step 3: Delete user document
  await db.doc(`users/${userId}`).delete();

  // Step 4: Delete from Firebase Auth
  await admin.auth().deleteUser(userId);

  // Step 5: Delete uploaded files from Storage
  const bucket = admin.storage().bucket();
  await bucket.deleteFiles({ prefix: `uploads/${userId}/` });

  // Step 6: Delete from other collections
  await db.doc(`processingStatus/${userId}`).delete();

  return { success: true };
});

async function deleteCollection(collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(query, resolve) {
  const snapshot = await query.get();

  if (snapshot.size === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(query, resolve);
  });
}
```

**UI with Confirmation:**

```html
<div class="danger-zone">
  <h2>Delete Account</h2>
  <p class="warning">
    ⚠️ This action cannot be undone. All your data will be permanently deleted.
  </p>

  <button class="btn-danger" onclick="showDeleteConfirmation()">
    Delete My Account
  </button>
</div>

<!-- Confirmation Modal -->
<div class="delete-confirmation-modal" style="display: none;">
  <h2>Are you absolutely sure?</h2>

  <div class="warning-box">
    <p><strong>This will permanently delete:</strong></p>
    <ul>
      <li>Your profile</li>
      <li>{{bookCount}} books</li>
      <li>{{highlightCount}} highlights and notes</li>
      <li>{{wordCount}} vocabulary words</li>
      <li>All social connections</li>
      <li>All likes and comments</li>
    </ul>
  </div>

  <p>Please type <code>DELETE</code> to confirm:</p>
  <input type="text" id="delete-confirmation-input" placeholder="Type DELETE">

  <div class="modal-actions">
    <button class="btn-secondary" onclick="closeDeleteModal()">Cancel</button>
    <button class="btn-danger" id="confirm-delete-btn" disabled onclick="deleteAccount()">
      Yes, Delete My Account
    </button>
  </div>
</div>

<script>
document.getElementById('delete-confirmation-input').addEventListener('input', (e) => {
  const btn = document.getElementById('confirm-delete-btn');
  btn.disabled = e.target.value !== 'DELETE';
});

async function deleteAccount() {
  showLoading('Deleting your account...');

  try {
    await firebase.functions().httpsCallable('deleteAccount')();
    alert('Your account has been deleted.');
    window.location.href = '/';
  } catch (error) {
    alert('Error deleting account: ' + error.message);
  }
}
</script>
```

---

#### 2.3 Privacy Policy & Terms of Service

**Create Transparent Documentation:**

**Key Points to Address:**

1. **What data we collect:**
   - SQLite file contents (temporarily, deleted after processing)
   - Extracted highlights, books, vocabulary
   - Usage analytics (anonymized)

2. **How we use data:**
   - Display your data back to you
   - Generate analytics and visualizations
   - Enable social features (if opted in)
   - Improve the service

3. **How we protect data:**
   - Encrypted in transit (HTTPS)
   - Encrypted at rest (Firestore default encryption)
   - Access controls (Firestore security rules)
   - Regular security audits

4. **Who we share data with:**
   - Other users (only if you choose public mode)
   - No third-party advertising
   - No data selling
   - Service providers (Firebase/Google) - covered by their privacy policy

5. **Your rights:**
   - Access your data (export)
   - Delete your data (account deletion)
   - Change privacy settings
   - Opt out of analytics

**Privacy Policy Page:**

```markdown
# Koby Privacy Policy

Last updated: November 15, 2025

## Our Commitment

Your reading data is personal and private. We built Koby to give you control over your Kobo highlights, not to collect data for advertising or resale.

**We will never:**
- Sell your data to third parties
- Use your data for advertising
- Share your data without your consent

## Data We Collect

### 1. Account Information
- Email address (from Google sign-in)
- Display name/nickname (chosen by you)
- Profile information (bio, social links)

### 2. Reading Data
- Books from your Kobo database
- Highlights and annotations
- Vocabulary words looked up
- Reading statistics (time spent, progress)

### 3. Social Data (if you opt in)
- Likes on highlights
- Follows/followers
- Comments and discussions
- Shared highlights

### 4. Usage Data (anonymized)
- Pages visited
- Features used
- Error logs
- Performance metrics

## How We Use Your Data

- **Display your data** - Show you your highlights, stats, and analytics
- **Enable features** - PKM export, flashcards, quote sharing
- **Social features** - Connect you with other readers (if opted in)
- **Improve Koby** - Understand which features are valuable
- **Support you** - Help troubleshoot issues

## Your Privacy Choices

### Offline Mode
Process your Kobo database entirely in your browser. Zero data uploaded to our servers. [Learn more](#)

### Private Account
Store data in the cloud, but keep your profile and highlights private.

### Public Account
Share your reading journey with others. You control exactly what's visible.

### Granular Controls
- Choose default visibility for highlights
- Make individual highlights public/private
- Control who can follow you, message you, comment

## Data Storage & Security

- **Where:** Google Cloud Platform (Firebase), US data centers
- **Encryption:** In transit (HTTPS) and at rest (Firestore)
- **Access:** Only you can access your private data
- **Retention:** Until you delete your account

## Your Rights

Under GDPR, CCPA, and other privacy laws, you have the right to:

- **Access your data** - Export all your data anytime
- **Delete your data** - Permanently delete your account
- **Correct your data** - Edit any information
- **Restrict processing** - Use offline mode
- **Data portability** - Export in standard formats (JSON, CSV, Markdown)

## Third-Party Services

We use:
- **Firebase (Google)** - Hosting, database, authentication ([Privacy Policy](https://firebase.google.com/support/privacy))
- **Google Analytics** - Anonymized usage stats ([Privacy Policy](https://policies.google.com/privacy))

We do NOT use:
- Advertising networks
- Data brokers
- Social media trackers

## Changes to This Policy

We'll notify you of material changes via email or prominent notice on the site.

## Contact

Questions about privacy? Email us at privacy@koby.app

---

[View Terms of Service](#) | [View Cookie Policy](#)
```

---

### Phase 3: Advanced Security (Weeks 7-10)

#### 3.1 End-to-End Encryption (Optional)

**For ultra-sensitive annotations:**

```javascript
// Encrypt highlights client-side before uploading
class E2EEManager {
  async generateKey(passphrase) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode('koby-salt'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encryptHighlight(text, key) {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(text)
    );

    return {
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      iv: btoa(String.fromCharCode(...iv))
    };
  }

  async decryptHighlight(ciphertext, iv, key) {
    const dec = new TextDecoder();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: this.base64ToArrayBuffer(iv) },
      key,
      this.base64ToArrayBuffer(ciphertext)
    );

    return dec.decode(decrypted);
  }

  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
```

**Trade-offs:**
- ✅ Maximum security (even we can't read your notes)
- ❌ Lose ability to search highlights server-side
- ❌ Can't recover data if passphrase is lost
- ❌ Complex UX

**Recommendation:** Offer as opt-in for power users only.

---

#### 3.2 Activity Audit Log

**Track who accessed your data:**

```firestore
/users/{userId}/auditLog/{logId}
  - action: 'login' | 'profile_view' | 'highlight_view' | 'export' | 'settings_change'
  - actorId: string (userId or 'system')
  - timestamp: Timestamp
  - ipAddress: string (hashed)
  - userAgent: string
  - details: object
```

**UI:**

```html
<div class="audit-log">
  <h2>Account Activity</h2>
  <p>Recent activity on your account</p>

  <table>
    <thead>
      <tr>
        <th>Action</th>
        <th>Date/Time</th>
        <th>IP Address</th>
        <th>Device</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Login</td>
        <td>Nov 15, 2025 3:42 PM</td>
        <td>192.168.***.***</td>
        <td>Chrome on Mac</td>
      </tr>
      <tr>
        <td>Exported data</td>
        <td>Nov 14, 2025 10:23 AM</td>
        <td>192.168.***.***</td>
        <td>Firefox on Windows</td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## Trust Building Initiatives

### 1. Privacy-First Marketing

**Messaging:**
- "Your highlights stay yours. No ads, no data mining, no BS."
- "Read. Highlight. Export. All your data, zero strings attached."
- "We built Koby because we love reading, not because we want your data."

**Landing Page Trust Signals:**
- ✅ Offline mode available
- ✅ No ads, ever
- ✅ Open-source roadmap (GitHub)
- ✅ GDPR & CCPA compliant
- ✅ Data export anytime
- ✅ Delete account anytime

### 2. Open Source Components

**Publish:**
- Data extraction scripts (Python/JS)
- Export formatters (Markdown, CSV, Anki)
- Offline processing library

**Benefits:**
- Build trust through transparency
- Community contributions
- Security audits by researchers

### 3. Security Certifications

**Consider:**
- SOC 2 Type II certification (expensive, but valuable for trust)
- Bug bounty program (invite researchers to find vulnerabilities)
- Regular penetration testing

---

## Success Metrics

- [ ] 30%+ of new users choose offline mode
- [ ] <1% of users report privacy concerns
- [ ] Zero data breaches
- [ ] 4.5+ star rating on privacy reviews (e.g., PrivacyTools.io)
- [ ] Privacy policy read time >2 minutes (indicates thoroughness)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|----------|
| Users don't understand privacy options | High | Clear onboarding, default to most private setting |
| Offline mode limits social features | Medium | Offer easy upgrade path to private cloud mode |
| E2EE complicates UX | Medium | Make optional, provide clear warnings |
| Compliance burden (GDPR, CCPA) | Medium | Implement all rights from day one |

---

*Last Updated: 2025-11-15*
