# Architecture & Performance Optimization Plan

## Executive Summary

Koby currently consumes excessive backend resources due to inefficient data loading patterns, lack of caching, and unoptimized queries. This document outlines a comprehensive optimization strategy to reduce costs, improve performance, and support scaling to thousands of users.

---

## Current Performance Issues

### Critical Bottlenecks

1. **`loadAllPublicData()` Function** (`script.js:383-424`)
   - **Problem**: Fetches ALL users, then ALL books/highlights from ALL users
   - **Impact**: O(n²) complexity, exponential growth with user count
   - **Resource Cost**: Firestore reads = users × (books + highlights per user)
   - **Estimated Current Cost**: ~500 reads for 10 users, ~50,000 reads for 100 users

2. **Landing Page Trending Highlights** (`script.js:258-331`)
   - **Problem**: Fetches 10 highlights per user from all users, then shuffles client-side
   - **Impact**: Excessive data transfer, poor mobile performance
   - **Better Approach**: Server-side aggregation or pre-computed trending feed

3. **No Caching Layer**
   - Every page load re-fetches all data from Firestore
   - Charts recalculated on every filter change
   - No use of browser storage (localStorage/IndexedDB)

4. **Batch Processing Inefficiency** (`functions/index.js`)
   - Sequential processing of books, highlights, words
   - No parallel processing for independent operations
   - BATCH_LIMIT set to 490 (near Firestore's 500 limit) without error recovery

5. **Missing Firestore Indexes**
   - No composite indexes for common query patterns
   - Inefficient sorting and filtering on client side

---

## Optimization Strategy

### Phase 1: Immediate Wins (1-2 weeks)

#### 1.1 Refactor Public Data Loading

**Current Code:**
```javascript
// BAD: Fetches all data from all users
async function loadAllPublicData() {
  const usersSnapshot = await getDocs(collection(db, "users"));
  for (const userDoc of usersSnapshot.docs) {
    const booksSnapshot = await getDocs(collection(db, `users/${userId}/books`));
    const highlightsSnapshot = await getDocs(collection(db, `users/${userId}/highlights`));
    // ...
  }
}
```

**Optimized Approach:**
```javascript
// GOOD: Use collectionGroup queries with pagination
async function loadTrendingHighlights(limit = 20) {
  const highlightsQuery = query(
    collectionGroup(db, 'highlights'),
    where('likeCount', '>=', 1), // Only fetch liked content
    orderBy('likeCount', 'desc'),
    orderBy('date_created', 'desc'),
    limit(limit)
  );
  return await getDocs(highlightsQuery);
}
```

**Benefits:**
- Reduces reads by 95%+ (from ~50,000 to ~20)
- Server-side filtering and sorting
- Supports infinite scroll pagination
- Firestore automatically uses indexes

#### 1.2 Implement Caching Layer

**Strategy:**
- **User Profile Data**: Cache in `localStorage` (expires after 1 hour)
- **Book/Highlight Data**: Cache in `IndexedDB` (expires on new upload)
- **Chart Data**: Memoize computed values using React/Vue-style reactivity
- **API Responses**: Service Worker caching for offline support

**Implementation:**
```javascript
class DataCache {
  constructor() {
    this.db = null; // IndexedDB instance
    this.memoryCache = new Map();
  }

  async get(key, fetchFn, ttl = 3600000) {
    // 1. Check memory cache
    if (this.memoryCache.has(key)) {
      const { data, expires } = this.memoryCache.get(key);
      if (Date.now() < expires) return data;
    }

    // 2. Check IndexedDB
    const cached = await this.getFromIndexedDB(key);
    if (cached && Date.now() < cached.expires) {
      this.memoryCache.set(key, cached);
      return cached.data;
    }

    // 3. Fetch fresh data
    const data = await fetchFn();
    const expires = Date.now() + ttl;
    await this.setInIndexedDB(key, { data, expires });
    this.memoryCache.set(key, { data, expires });
    return data;
  }

  invalidate(pattern) {
    // Clear cache on upload
  }
}
```

**Expected Impact:**
- 80% reduction in Firestore reads for returning users
- Instant page loads after first visit
- Better offline experience

#### 1.3 Add Firestore Composite Indexes

**Required Indexes:**

1. **Trending Highlights:**
   ```
   Collection Group: highlights
   Fields: likeCount (Descending), date_created (Descending)
   ```

2. **User Timeline:**
   ```
   Collection: users/{userId}/highlights
   Fields: date_created (Descending)
   ```

3. **Book Highlights:**
   ```
   Collection: users/{userId}/highlights
   Fields: book_id (Ascending), date_created (Descending)
   ```

4. **Filtered Highlights:**
   ```
   Collection: users/{userId}/highlights
   Fields: type (Ascending), color (Ascending), date_created (Descending)
   ```

**Create indexes via Firebase CLI:**
```json
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "highlights",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "likeCount", "order": "DESCENDING" },
        { "fieldPath": "date_created", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

### Phase 2: Architectural Improvements (3-4 weeks)

#### 2.1 Implement Lazy Loading & Virtualization

**Highlights List Virtualization:**
- Use `Intersection Observer API` for infinite scroll
- Render only visible highlights (virtual scrolling)
- Load 20 highlights per page, prefetch next page

**Library Options:**
- `react-window` (if migrating to React)
- Custom implementation with `IntersectionObserver`

#### 2.2 Optimize Cloud Function Processing

**Current Bottleneck:**
```javascript
// Sequential processing
for (const book of books) { /* process */ }
for (const highlight of highlights) { /* process */ }
for (const word of words) { /* process */ }
```

**Optimized Parallel Processing:**
```javascript
await Promise.all([
  processBooksInBatches(books, userId),
  processHighlightsInBatches(highlights, userId),
  processWordsInBatches(words, userId)
]);
```

**Batch Error Recovery:**
```javascript
async function commitBatchWithRetry(batch, retries = 3) {
  try {
    await batch.commit();
  } catch (error) {
    if (retries > 0 && error.code === 'deadline-exceeded') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return commitBatchWithRetry(batch, retries - 1);
    }
    throw error;
  }
}
```

**Benefits:**
- 40-60% faster processing times
- Better error handling
- Reduced function execution costs

#### 2.3 Implement Server-Side Aggregation

**Create Firestore Triggers for Denormalization:**

```javascript
// functions/aggregation.js
exports.updateUserStats = functions.firestore
  .document('users/{userId}/highlights/{highlightId}')
  .onCreate(async (snap, context) => {
    const { userId } = context.params;
    const userRef = db.doc(`users/${userId}`);

    await userRef.update({
      totalHighlights: admin.firestore.FieldValue.increment(1),
      lastHighlightDate: admin.firestore.FieldValue.serverTimestamp()
    });
  });

exports.updateGlobalTrending = functions.firestore
  .document('users/{userId}/highlights/{highlightId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // If like count changed significantly, add to trending collection
    if (after.likeCount >= 10 && before.likeCount < 10) {
      await db.collection('trending').doc(context.params.highlightId).set({
        ...after,
        userId: context.params.userId,
        trendingScore: calculateTrendingScore(after)
      });
    }
  });
```

**New Collections:**
- `/trending` - Pre-computed trending highlights
- `/userStats` - Aggregated user statistics
- `/globalStats` - Platform-wide metrics

---

### Phase 3: Advanced Optimization (4-6 weeks)

#### 3.1 Migrate to Edge Functions

**Current**: Firebase Cloud Functions (US-based)
**Proposed**: Firebase Hosting + Cloud Run (multi-region)

**Benefits:**
- 50-200ms faster response times globally
- Auto-scaling based on demand
- Lower cold start latency

#### 3.2 Implement CDN for Static Assets

**Assets to Cache:**
- Chart.js library
- Firebase SDK
- Custom JavaScript/CSS
- User-generated highlight images (future feature)

**Implementation:**
```json
// firebase.json
{
  "hosting": {
    "headers": [
      {
        "source": "**/*.@(jpg|jpeg|gif|png|svg|webp)",
        "headers": [{
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }]
      },
      {
        "source": "**/*.@(js|css)",
        "headers": [{
          "key": "Cache-Control",
          "value": "public, max-age=604800, stale-while-revalidate=86400"
        }]
      }
    ]
  }
}
```

#### 3.3 Code Splitting & Minification

**Current Bundle Size:** ~1.3MB (uncompressed)
**Target Bundle Size:** <300KB (gzipped)

**Strategy:**
- Split `script.js` into modules:
  - `core.js` - Essential functionality
  - `charts.js` - Chart.js and visualization (lazy load)
  - `profile.js` - Profile management (route-based)
  - `upload.js` - Upload functionality (route-based)

**Build Pipeline:**
```bash
# Use esbuild for fast bundling
npm install --save-dev esbuild
npx esbuild script.js --bundle --minify --splitting --outdir=dist
```

#### 3.4 Database Schema Optimization

**Current Schema Issues:**
- Denormalized data duplicated across documents
- Large arrays (likes) stored in documents
- No sharding strategy for high-traffic users

**Proposed Schema Changes:**

1. **Separate Likes Collection:**
```
/likes/{highlightId}_{userId}
  - highlightId: string
  - userId: string
  - timestamp: Timestamp
```
Benefits: No document size limits, easier to query "who liked what"

2. **Sharded Counters for Likes:**
```
/highlights/{highlightId}/likeShards/{shardId}
  - count: number
```
Benefits: Prevents write contention on popular highlights

3. **User Activity Feed:**
```
/users/{userId}/activity/{activityId}
  - type: 'like' | 'upload' | 'share'
  - targetId: string
  - timestamp: Timestamp
```
Benefits: Enables future social features (activity feed, notifications)

---

## Performance Monitoring

### Key Metrics to Track

1. **Firestore Usage:**
   - Reads per user per session
   - Writes per upload
   - Query latency (p50, p95, p99)

2. **Function Performance:**
   - Upload processing time
   - Memory usage
   - Error rate

3. **Frontend Performance:**
   - First Contentful Paint (FCP) - Target: <1.5s
   - Largest Contentful Paint (LCP) - Target: <2.5s
   - Time to Interactive (TTI) - Target: <3.5s

4. **User Experience:**
   - Chart render time
   - Infinite scroll lag
   - Search responsiveness

### Implementation

**Google Analytics 4 + Firebase Performance:**
```javascript
// Track custom metrics
const perf = getPerformance(app);
const trace = trace(perf, 'load_highlights');
trace.start();
// ... load data ...
trace.putMetric('highlight_count', highlights.length);
trace.stop();
```

**Firestore Query Monitoring:**
```javascript
async function monitoredQuery(queryFn, queryName) {
  const start = performance.now();
  const result = await queryFn();
  const duration = performance.now() - start;

  logEvent(analytics, 'firestore_query', {
    query_name: queryName,
    duration_ms: Math.round(duration),
    result_count: result.size
  });

  return result;
}
```

---

## Cost Projection

### Current Costs (Estimated for 100 Active Users)

| Service | Current Usage | Cost/Month |
|---------|--------------|------------|
| Firestore Reads | 5M reads | $0.18 |
| Firestore Writes | 50K writes | $0.05 |
| Cloud Functions | 10K invocations | $0.00 |
| Cloud Storage | 10GB | $0.26 |
| **Total** | | **$0.49** |

### Projected Costs After Optimization (1,000 Active Users)

| Service | Optimized Usage | Cost/Month | Savings |
|---------|----------------|------------|---------|
| Firestore Reads | 8M reads (vs 500M) | $0.29 | **98.4%** |
| Firestore Writes | 500K writes | $0.45 | - |
| Cloud Functions | 100K invocations | $0.00 | - |
| Cloud Storage | 100GB | $2.60 | - |
| **Total** | | **$3.34** | **vs $180** |

**Savings at 1,000 Users:** ~$177/month (~98% reduction)

---

## Implementation Priority

### High Priority (Week 1-2)
- ✅ Refactor `loadAllPublicData()` to use `collectionGroup` queries
- ✅ Add composite Firestore indexes
- ✅ Implement basic localStorage caching for user data

### Medium Priority (Week 3-4)
- ✅ Add IndexedDB caching layer
- ✅ Implement lazy loading for highlights
- ✅ Optimize Cloud Function batch processing
- ✅ Add performance monitoring

### Low Priority (Week 5-6)
- ⏳ Migrate to Cloud Run for edge functions
- ⏳ Implement code splitting
- ⏳ Add CDN caching headers
- ⏳ Refactor database schema (breaking change)

---

## Success Criteria

- [ ] Firestore reads reduced by 90%+ for typical user session
- [ ] Landing page loads in <2s (LCP metric)
- [ ] Upload processing completes in <10s for average database (200 highlights)
- [ ] Zero query timeout errors
- [ ] Monthly costs remain under $10 for 1,000 active users
- [ ] No degradation in functionality or user experience

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|----------|
| Cache invalidation bugs | High | Implement versioning in cache keys, add manual "Refresh" button |
| Firestore index creation lag | Medium | Deploy indexes 24h before code changes |
| Breaking schema changes | High | Use phased migration, maintain backward compatibility |
| Increased complexity | Medium | Comprehensive testing, rollback plan |

---

## Next Steps

1. Review and approve optimization plan
2. Set up Firebase Performance Monitoring
3. Create feature branch: `optimize/backend-performance`
4. Implement Phase 1 optimizations
5. Conduct load testing with synthetic data
6. Deploy to production with feature flags
7. Monitor metrics for 1 week
8. Proceed to Phase 2 if metrics meet targets

---

*Last Updated: 2025-11-15*
