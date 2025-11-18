# Koby API Documentation

## Overview

This document describes all the major JavaScript modules, classes, and functions in Koby. Use this as a reference for developers contributing to the project.

## Table of Contents

1. [Cache Manager](#cache-manager)
2. [Performance Monitor](#performance-monitor)
3. [Analytics Manager](#analytics-manager)
4. [Recommendation Engine](#recommendation-engine)
5. [Book Graph](#book-graph)
6. [Export Managers](#export-managers)
7. [Social Features](#social-features)
8. [Accessibility](#accessibility)
9. [Lazy Loading](#lazy-loading)
10. [Testing Framework](#testing-framework)

---

## Cache Manager

**File:** `cache-manager.js`

Implements multi-layer caching to reduce Firestore reads by 80%+.

### Class: `CacheManager`

#### Methods

##### `init()`
Initialize IndexedDB for persistent caching.

```javascript
const cacheManager = new CacheManager();
await cacheManager.init();
```

##### `set(store, key, value)`
Store data in cache.

**Parameters:**
- `store` (string): Storage name ('books', 'highlights', 'words', 'userData')
- `key` (string): Unique identifier
- `value` (any): Data to cache

```javascript
await cacheManager.set('books', 'book-123', bookData);
```

##### `get(store, key)`
Retrieve data from cache.

**Returns:** Promise<any>

```javascript
const book = await cacheManager.get('books', 'book-123');
```

##### `clear(store)`
Clear all cache for a specific store.

```javascript
await cacheManager.clear('books');
```

---

## Performance Monitor

**File:** `performance-monitor.js`

Tracks custom metrics and performance data using Firebase Performance Monitoring.

### Class: `PerformanceMonitor`

#### Methods

##### `startTrace(traceName)`
Start a custom performance trace.

```javascript
performanceMonitor.startTrace('data_load');
```

##### `stopTrace(traceName)`
Stop a performance trace.

```javascript
performanceMonitor.stopTrace('data_load');
```

##### `trackOperation(traceName, operation, attributes)`
Track an async operation with automatic start/stop.

**Parameters:**
- `traceName` (string): Name of the operation
- `operation` (Function): Async function to track
- `attributes` (object): Optional attributes

```javascript
await performanceMonitor.trackOperation(
    'fetch_highlights',
    async () => await fetchHighlights(),
    { user_id: userId }
);
```

##### `trackUpload(fileSize, uploadFunction)`
Track file upload performance.

```javascript
await performanceMonitor.trackUpload(fileSize, async () => {
    // Upload logic
});
```

---

## Analytics Manager

**File:** `analytics-manager.js`

Provides reading analytics and insights.

### Class: `AnalyticsManager`

#### Methods

##### `analyzeReadingPatterns(books, highlights)`
Analyze user's reading patterns.

**Returns:** Object with analytics data

```javascript
const analytics = new AnalyticsManager(userId);
const patterns = await analytics.analyzeReadingPatterns(books, highlights);
```

##### `generateAnnualRecap(year)`
Generate Spotify Wrapped-style annual recap.

```javascript
const recap = await analytics.generateAnnualRecap(2025);
```

##### `getReadingStreaks()`
Calculate reading streaks.

**Returns:** Object with streak data

---

## Recommendation Engine

**File:** `recommendation-engine.js`

Generates book recommendations using Google Books API.

### Class: `RecommendationEngine`

#### Constructor

```javascript
const engine = new RecommendationEngine(userId);
```

#### Methods

##### `getRecommendations(count = 10)`
Get personalized book recommendations.

**Parameters:**
- `count` (number): Number of recommendations to return

**Returns:** Promise<Array<Book>>

```javascript
const recommendations = await engine.getRecommendations(10);
```

##### `getTrendingBooks(count = 10)`
Get trending new releases.

```javascript
const trending = await engine.getTrendingBooks(10);
```

##### `getSimilarBooks(bookTitle, count = 5)`
Get books similar to a specific title.

```javascript
const similar = await engine.getSimilarBooks('Atomic Habits', 5);
```

### Class: `WishlistManager`

#### Methods

##### `addToWishlist(book)`
Add book to user's wishlist.

```javascript
const wishlist = new WishlistManager(userId);
await wishlist.addToWishlist(book);
```

##### `getWishlist()`
Retrieve user's wishlist.

**Returns:** Promise<Array<Book>>

---

## Book Graph

**File:** `book-graph.js`

Visualizes connections between books using D3.js.

### Class: `BookConnectionAnalyzer`

#### Methods

##### `analyze()`
Analyze books and find connections.

**Returns:** Promise<{nodes, links}>

```javascript
const analyzer = new BookConnectionAnalyzer(userId);
const graphData = await analyzer.analyze();
```

### Class: `BookGraphVisualizer`

#### Constructor

```javascript
const visualizer = new BookGraphVisualizer('container-id', {
    width: 1000,
    height: 800
});
```

#### Methods

##### `render(graphData)`
Render the book connection graph.

```javascript
visualizer.render(graphData);
```

##### `destroy()`
Clean up and destroy the visualization.

---

## Export Managers

### PKM Exporter

**File:** `pkm-exporter.js`

#### Class: `PKMExporter`

##### `exportToObsidian(options)`
Export highlights to Obsidian format.

```javascript
const exporter = new PKMExporter(userId);
await exporter.exportToObsidian({
    format: 'single-file',
    includeMetadata: true
});
```

##### `exportToNotion(options)`
Export highlights to Notion format.

##### `exportToLogseq(options)`
Export highlights to Logseq format.

### Flashcard Exporter

**File:** `flashcard-exporter.js`

#### Class: `FlashcardExporter`

##### `exportToAnki(words)`
Export vocabulary to Anki format.

```javascript
const exporter = new FlashcardExporter();
await exporter.exportToAnki(vocabularyWords);
```

---

## Social Features

### Follow Manager

**File:** `follow-manager.js`

#### Class: `FollowManager`

##### `followUser(userId)`
Follow another user.

```javascript
const followManager = new FollowManager();
await followManager.followUser(targetUserId);
```

##### `unfollowUser(userId)`
Unfollow a user.

##### `getFollowers(userId)`
Get list of followers.

**Returns:** Promise<Array<User>>

##### `getFollowing(userId)`
Get list of users being followed.

### Feed Manager

**File:** `feed-manager.js`

#### Class: `FeedManager`

##### `loadFeed(limit = 20)`
Load personalized activity feed.

```javascript
const feedManager = new FeedManager(userId);
const feedItems = await feedManager.loadFeed(20);
```

### Comment Manager

**File:** `comment-manager.js`

#### Class: `CommentManager`

##### `addComment(highlightId, text)`
Add comment to a highlight.

```javascript
const commentManager = new CommentManager();
await commentManager.addComment(highlightId, 'Great quote!');
```

##### `getComments(highlightId)`
Get all comments for a highlight.

**Returns:** Promise<Array<Comment>>

---

## Accessibility

**File:** `accessibility.js`

### Class: `AccessibilityManager`

#### Methods

##### `announce(message, priority = 'polite')`
Announce message to screen readers.

```javascript
a11y.announce('Data loaded successfully');
```

##### `makeAccessibleButton(element, clickHandler)`
Make any element accessible as a button.

```javascript
a11y.makeAccessibleButton(divElement, () => handleClick());
```

##### `createAccessibleModal(title, content)`
Create an accessible modal dialog.

```javascript
const modal = a11y.createAccessibleModal('Title', 'Content');
a11y.openModal(modal);
```

---

## Lazy Loading

**File:** `lazy-loader.js`

### Class: `LazyLoader`

Base class for implementing lazy loading with Intersection Observer.

#### Methods

##### `init(container, sentinel, renderCallback)`
Initialize lazy loading.

**Parameters:**
- `container` (HTMLElement): Container for items
- `sentinel` (HTMLElement): Element to observe for triggering load
- `renderCallback` (Function): Function to render new items

```javascript
const loader = new HighlightsLazyLoader(userId, { pageSize: 20 });
await loader.init(container, sentinel, renderItems);
```

### Class: `HighlightsLazyLoader`

Specialized loader for highlights with filtering support.

##### `setFilters(filters)`
Apply filters and reload.

```javascript
await loader.setFilters({
    book: 'book-id',
    color: 0,
    sort: 'recent'
});
```

---

## Testing Framework

**File:** `tests/test-framework.js`

### Class: `TestRunner`

#### Methods

##### `registerSuite(name, tests)`
Register a test suite.

```javascript
const runner = new TestRunner();
runner.registerSuite('My Tests', [
    {
        name: 'Test 1',
        fn: () => assert.equal(1, 1)
    }
]);
```

##### `runAll()`
Run all registered test suites.

```javascript
await runner.runAll();
const results = runner.getResults();
```

### Assertion Helpers

```javascript
import { assert } from './test-framework.js';

assert.equal(actual, expected);
assert.deepEqual(obj1, obj2);
assert.true(value);
assert.exists(value);
assert.arrayContains(array, item);
```

---

## Cloud Functions

**File:** `functions/index.js`

### Callable Functions

#### `followUser`
Follow a user.

**Parameters:**
- `userId` (string): ID of user to follow

```javascript
const result = await firebase.functions().httpsCallable('followUser')({
    userId: 'target-user-id'
});
```

#### `unfollowUser`
Unfollow a user.

#### `addComment`
Add comment to a highlight.

**Parameters:**
- `highlightId` (string): Highlight ID
- `text` (string): Comment text
- `parentId` (string, optional): Parent comment ID for replies

### Triggered Functions

#### `processKoboDB`
Automatically triggered when a Kobo database file is uploaded to Cloud Storage.

**Trigger:** `onObjectFinalized`

---

## Data Models

### Book

```typescript
interface Book {
    book_id: string;
    title: string;
    author?: string;
    time_spent_reading?: number;
    percent_read?: number;
    series?: string;
    date_last_read?: string;
    visibility?: 'public' | 'private' | 'followers_only';
}
```

### Highlight

```typescript
interface Highlight {
    text: string;
    annotation?: string;
    book_id: string;
    color: number;
    date_created: string;
    type: 'highlight' | 'note';
    visibility?: 'public' | 'private' | 'followers_only';
    likeCount?: number;
    commentCount?: number;
}
```

### User

```typescript
interface User {
    uid: string;
    displayName: string;
    email: string;
    photoURL?: string;
    followerCount?: number;
    followingCount?: number;
}
```

---

## Error Handling

All async functions should handle errors gracefully:

```javascript
try {
    const data = await someAsyncFunction();
    // Handle success
} catch (error) {
    console.error('Error:', error);
    // Show user-friendly message
    alert('Something went wrong. Please try again.');
}
```

---

## Performance Best Practices

1. **Use caching** - Always check cache before querying Firestore
2. **Lazy load** - Use LazyLoader for large lists
3. **Batch operations** - Batch Firestore writes when possible
4. **Monitor performance** - Use PerformanceMonitor for critical operations
5. **Optimize queries** - Use composite indexes for complex queries

---

## Security Best Practices

1. **Validate input** - Always validate user input on both client and server
2. **Check authentication** - Verify user is authenticated before operations
3. **Enforce authorization** - Use Firestore security rules
4. **Sanitize data** - Sanitize user-generated content before display
5. **Rate limiting** - Implement rate limiting on Cloud Functions

---

## Contributing

When adding new features:

1. Follow existing code style
2. Add JSDoc comments
3. Write tests for new functionality
4. Update this documentation
5. Test accessibility features

---

*Last Updated: 2025-11-18*
