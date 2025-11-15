# Social Network Features Plan

## Executive Summary

Transform Koby from a personal reading tracker into a vibrant social reading community while maintaining its core value proposition as a Kobo data bridge. This plan outlines features to increase engagement, build connections between readers, and create network effects.

---

## Current Social Features

### What We Have ✅
- Like system for highlights
- Public user profiles
- Trending highlights feed
- Social media link integration
- Share URLs for individual highlights
- "Shared by" attribution

### What's Missing ❌
- User-to-user connections (following system)
- Activity feed
- Comments/discussions
- Reading clubs/groups
- Notifications
- Direct messaging
- User discovery mechanisms
- Content moderation tools

---

## Strategic Approach

### Core Principle: **Async Social Interaction Around Books**

Unlike traditional social networks focused on real-time engagement, Koby should emphasize:
- **Thoughtful, asynchronous discussions** around highlights
- **Discovery of books through trusted readers**, not algorithms
- **Privacy-first social features** (opt-in visibility)
- **Quality over quantity** (meaningful interactions vs engagement metrics)

---

## Feature Design

### Phase 1: Foundation (Weeks 1-3)

#### 1.1 Following System

**User Stories:**
- "I want to follow readers with similar taste"
- "I want to see what my book club members are reading"
- "I want to discover new books through people I trust"

**Data Model:**
```firestore
/users/{userId}/following/{followedUserId}
  - followedAt: Timestamp
  - nickname: string (denormalized for quick display)

/users/{userId}/followers/{followerUserId}
  - followedAt: Timestamp
  - nickname: string (denormalized)

/users/{userId}
  - followingCount: number
  - followerCount: number
```

**UI Components:**
- Follow/Unfollow button on user profiles
- Following/Followers count badges
- "People You Might Like" discovery widget
- Following list modal

**Privacy Controls:**
- Allow users to hide follower/following lists
- Option to require approval for followers (private profile)

**Implementation Notes:**
```javascript
async function followUser(currentUserId, targetUserId) {
  const batch = writeBatch(db);

  // Add to current user's following
  batch.set(doc(db, `users/${currentUserId}/following/${targetUserId}`), {
    followedAt: serverTimestamp(),
    nickname: targetUser.nickname
  });

  // Add to target user's followers
  batch.set(doc(db, `users/${targetUserId}/followers/${currentUserId}`), {
    followedAt: serverTimestamp(),
    nickname: currentUser.nickname
  });

  // Update counts
  batch.update(doc(db, `users/${currentUserId}`), {
    followingCount: increment(1)
  });
  batch.update(doc(db, `users/${targetUserId}`), {
    followerCount: increment(1)
  });

  await batch.commit();
}
```

---

#### 1.2 Personalized Activity Feed

**What It Shows:**
- New highlights from people you follow
- Books your connections started/finished
- Popular highlights within your network
- Reading milestones (e.g., "Alice just read her 50th book!")

**Data Model:**
```firestore
/feed/{userId}/items/{activityId}
  - type: 'new_highlight' | 'finished_book' | 'started_book' | 'milestone'
  - actorId: string (user who performed action)
  - actorNickname: string
  - targetId: string (book/highlight ID)
  - targetTitle: string
  - text: string (highlight text, if applicable)
  - timestamp: Timestamp
  - read: boolean

// Feed is generated via Cloud Function on activity
```

**Feed Generation Strategy:**

**Option A: Fan-out on Write** (Better for Koby's scale)
```javascript
// Trigger when user adds highlight
exports.fanoutHighlight = functions.firestore
  .document('users/{userId}/highlights/{highlightId}')
  .onCreate(async (snap, context) => {
    const highlight = snap.data();
    const { userId } = context.params;

    // Get all followers
    const followersSnap = await db
      .collection(`users/${userId}/followers`)
      .get();

    // Write activity to each follower's feed
    const batch = writeBatch(db);
    followersSnap.forEach(doc => {
      const feedItem = db.doc(`feed/${doc.id}/items/${context.params.highlightId}`);
      batch.set(feedItem, {
        type: 'new_highlight',
        actorId: userId,
        actorNickname: highlight.userNickname,
        targetId: context.params.highlightId,
        text: highlight.text.substring(0, 200),
        timestamp: serverTimestamp(),
        read: false
      });
    });

    await batch.commit();
  });
```

**Feed Cleanup:**
- Limit to 100 most recent items per user
- TTL: 30 days (Cloud Function to delete old items)

**UI Components:**
- Dedicated "Feed" tab on homepage
- Real-time updates using Firestore listeners
- Pull-to-refresh on mobile
- Infinite scroll pagination
- Mark as read functionality

---

#### 1.3 User Discovery

**Discovery Mechanisms:**

1. **"Readers Like You" Recommendation Engine**
   - Based on shared liked highlights
   - Based on common books in library
   - Based on mutual followers

```javascript
async function findSimilarReaders(userId, limit = 10) {
  // Get user's liked highlights
  const likedHighlights = await db
    .collectionGroup('highlights')
    .where('likes', 'array-contains', userId)
    .limit(50)
    .get();

  // Count users who liked the same highlights
  const similarUsers = new Map();
  likedHighlights.forEach(doc => {
    const highlight = doc.data();
    highlight.likes.forEach(likedUserId => {
      if (likedUserId !== userId) {
        similarUsers.set(
          likedUserId,
          (similarUsers.get(likedUserId) || 0) + 1
        );
      }
    });
  });

  // Sort by similarity score
  return Array.from(similarUsers.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}
```

2. **"Popular in Your Network" Widget**
   - Show books that 3+ people you follow are reading
   - Highlight mutual connections

3. **Reading Circles**
   - Suggest users who like the same niche genres
   - "Also reading [Book Title]" prompts

---

### Phase 2: Engagement (Weeks 4-6)

#### 2.1 Comments & Discussions

**Feature Design:**
- Threaded comments on highlights
- Markdown support for formatting
- @ mentions to notify users
- Reply notifications

**Data Model:**
```firestore
/highlights/{highlightId}/comments/{commentId}
  - userId: string
  - userNickname: string
  - text: string
  - createdAt: Timestamp
  - editedAt: Timestamp
  - likeCount: number
  - parentCommentId: string (for threading)

/users/{userId}/notifications/{notificationId}
  - type: 'comment' | 'reply' | 'mention' | 'like'
  - actorId: string
  - actorNickname: string
  - targetType: 'highlight' | 'comment'
  - targetId: string
  - text: string (preview)
  - read: boolean
  - createdAt: Timestamp
```

**UI Features:**
- Comment box below each highlight
- "View X comments" button
- Collapsible thread view
- Edit/delete own comments
- Report inappropriate comments

**Moderation:**
- User can delete comments on their own highlights
- Report button triggers review queue
- Auto-hide comments with 3+ reports (pending review)

---

#### 2.2 Notification System

**Notification Types:**
1. **Social Interactions:**
   - New follower
   - Comment on your highlight
   - Reply to your comment
   - @ mention
   - Like on your highlight (batched: "10 people liked your highlight")

2. **Network Activity:**
   - Someone you follow finished a book you're reading
   - Popular discussion in your network

**Implementation:**
```firestore
/users/{userId}/notifications/{notificationId}
  - type: string
  - actorId: string
  - actorNickname: string
  - targetId: string
  - text: string
  - read: boolean
  - createdAt: Timestamp

/users/{userId}
  - unreadNotifications: number
```

**UI Components:**
- Bell icon in header with badge count
- Notification dropdown panel
- Mark as read on click
- "Mark all as read" button
- Email digest option (daily/weekly)

**Email Notifications:**
```javascript
// Cloud Function
exports.sendNotificationEmail = functions.firestore
  .document('users/{userId}/notifications/{notificationId}')
  .onCreate(async (snap, context) => {
    const notification = snap.data();
    const userDoc = await db.doc(`users/${context.params.userId}`).get();
    const user = userDoc.data();

    if (!user.emailNotifications) return;

    // Use SendGrid or Firebase Extensions Email Trigger
    await sendEmail({
      to: user.email,
      subject: `New ${notification.type} on Koby`,
      html: renderNotificationEmail(notification)
    });
  });
```

---

#### 2.3 Reading Clubs / Groups

**Feature Concept:**
- Create private or public reading groups
- Share group-exclusive highlights/notes
- Group discussion boards
- Shared reading challenges

**Data Model:**
```firestore
/groups/{groupId}
  - name: string
  - description: string
  - creatorId: string
  - memberCount: number
  - isPublic: boolean
  - createdAt: Timestamp
  - currentBook: { title, bookId } (optional)

/groups/{groupId}/members/{userId}
  - joinedAt: Timestamp
  - role: 'admin' | 'moderator' | 'member'

/groups/{groupId}/discussions/{discussionId}
  - title: string
  - authorId: string
  - authorNickname: string
  - text: string
  - bookId: string (optional)
  - createdAt: Timestamp
  - commentCount: number
  - likeCount: number
```

**UI Features:**
- "Create Group" button on profile
- Browse public groups
- Group invite links
- Dedicated group page with tabs:
  - Discussions
  - Members
  - Shared Highlights
  - About

**Use Cases:**
- Book clubs coordinating reads
- Genre-specific communities (SciFi readers, Romance readers)
- Language learners practicing together
- Academic study groups

---

### Phase 3: Advanced Social (Weeks 7-10)

#### 3.1 Direct Messaging

**Scope:** Simple, asynchronous messaging between users

**Data Model:**
```firestore
/conversations/{conversationId}
  - participants: [userId1, userId2]
  - lastMessage: string
  - lastMessageAt: Timestamp
  - unreadCount: { userId1: 0, userId2: 1 }

/conversations/{conversationId}/messages/{messageId}
  - senderId: string
  - text: string
  - sentAt: Timestamp
  - read: boolean
```

**Privacy Controls:**
- Users can disable DMs
- "Only people I follow can message me" option
- Block/report users

**UI:**
- Messages icon in header
- Chat-style interface
- Read receipts (optional)

---

#### 3.2 Collaborative Annotations

**Feature:** Allow friends to add notes to your highlights

**Use Case:**
- Book clubs discussing specific passages
- Teachers annotating student highlights
- Co-readers sharing insights

**Data Model:**
```firestore
/users/{userId}/highlights/{highlightId}/collaborativeNotes/{noteId}
  - authorId: string
  - authorNickname: string
  - text: string
  - createdAt: Timestamp
  - visibility: 'private' | 'shared_with_author' | 'public'
```

**Permissions:**
- Opt-in per highlight or globally
- Author can delete others' notes
- Collaborators can only edit their own notes

---

#### 3.3 Reading Challenges

**Feature:** Gamified social reading goals

**Challenge Types:**
1. **Personal Goals:**
   - "Read 50 books this year"
   - "Highlight 100 passages this month"
   - "Finish 5 books from your TBR pile"

2. **Group Challenges:**
   - "Book club completes 12 books this year"
   - "Read around the world" (books from different countries)
   - "Genre exploration" (read 1 book from 10 genres)

**Data Model:**
```firestore
/challenges/{challengeId}
  - title: string
  - description: string
  - type: 'personal' | 'group'
  - goal: number
  - metric: 'books' | 'highlights' | 'pages'
  - startDate: Timestamp
  - endDate: Timestamp
  - participants: [userId]
  - creatorId: string

/challenges/{challengeId}/progress/{userId}
  - current: number
  - goal: number
  - lastUpdatedAt: Timestamp
```

**UI Features:**
- Progress bars
- Leaderboards (optional, per challenge)
- Achievement badges
- Share progress on profile

---

## Privacy & Safety

### Core Principles
- **Opt-in social features** - Users must explicitly enable public profile
- **Granular visibility controls** - Per-highlight, per-book privacy settings
- **Easy blocking/muting** - One-click to hide users
- **Content moderation** - Report system with human review

### Privacy Settings

**Profile Level:**
- [ ] Public profile (discoverable in search)
- [ ] Show follower/following counts
- [ ] Allow followers
- [ ] Require follow approval
- [ ] Allow direct messages
- [ ] Show reading stats publicly

**Content Level:**
- [ ] Make all highlights public by default
- [ ] Show liked highlights
- [ ] Show vocabulary words
- [ ] Show reading activity in feed
- [ ] Allow collaborative notes

**Notification Preferences:**
- [ ] Email notifications
- [ ] Push notifications (future)
- Types to receive: [followers, comments, likes, mentions]

### Content Moderation

**Reporting System:**
```firestore
/reports/{reportId}
  - reporterId: string
  - targetType: 'highlight' | 'comment' | 'user' | 'group'
  - targetId: string
  - reason: 'spam' | 'harassment' | 'inappropriate' | 'copyright'
  - description: string
  - status: 'pending' | 'reviewed' | 'actioned' | 'dismissed'
  - createdAt: Timestamp
```

**Moderation Queue:**
- Admin dashboard to review reports
- Automated filters for common spam patterns
- 3-strike system for users
- Shadow ban option (hide content without notifying user)

---

## User Discovery & Growth

### Onboarding Flow for New Users

**Step 1: Upload Data** (existing)

**Step 2: Find Your People** (new)
- Import contacts from email (optional)
- Search for friends by email/username
- Browse suggested users based on:
  - Books in your library
  - Genres you read
  - Popular users overall

**Step 3: Personalize Profile** (enhanced)
- Add profile picture
- Write bio
- Set privacy preferences
- Choose interests/favorite genres

**Step 4: See Your Feed**
- If following 0 users: Show global trending highlights
- If following 1-5 users: Mix of followed + global trending
- If following 5+ users: Primarily followed users

### Invite System

**Feature:** Invite friends to Koby

**Incentives:**
- "You and your friend both get a thank-you badge"
- Early access to beta features
- No monetary incentives (avoid spam)

**Implementation:**
```firestore
/users/{userId}/invites/{inviteId}
  - email: string
  - status: 'sent' | 'accepted'
  - sentAt: Timestamp
  - acceptedAt: Timestamp

/users/{userId}
  - invitedBy: userId (null if organic signup)
  - inviteCount: number
```

**UI:**
- "Invite Friends" button in profile
- Email input form
- Track invite status

---

## Analytics & Metrics

### Key Social Metrics to Track

1. **Engagement:**
   - Daily Active Users (DAU)
   - Weekly Active Users (WAU)
   - Average session duration
   - Highlights per user per week

2. **Social Activity:**
   - Follows per user
   - Comments per highlight
   - Likes per highlight
   - DMs sent per week

3. **Content Quality:**
   - % of highlights with likes
   - % of highlights with comments
   - Average comment length
   - Report rate (lower is better)

4. **Growth:**
   - New signups per week
   - Invite conversion rate
   - Retention rate (Day 1, Day 7, Day 30)
   - Churn rate

5. **Network Effects:**
   - % of users with 1+ followers
   - % of users with 5+ followers
   - Average network size
   - % of feed views vs trending views

### Implementation
```javascript
// Track social events
logEvent(analytics, 'follow_user', { target_user_id: targetUserId });
logEvent(analytics, 'comment_created', { highlight_id: highlightId });
logEvent(analytics, 'dm_sent', { conversation_id: conversationId });

// Track metrics in Firestore for dashboards
await db.doc(`metrics/daily_${dateString}`).set({
  dau: increment(1),
  new_signups: increment(isNewUser ? 1 : 0),
  highlights_created: increment(highlightCount),
  follows_created: increment(followCount)
}, { merge: true });
```

---

## Mobile Considerations

### Responsive Design Priorities
- Touch-optimized follow/like buttons
- Swipe gestures for navigation
- Bottom navigation bar (Home, Feed, Profile, Notifications)
- Pull-to-refresh on feed
- Optimized image loading for highlight images (future feature)

### Progressive Web App (PWA)
- Add to homescreen prompt
- Offline support for cached feed
- Push notifications (with user permission)
- Background sync for draft comments

---

## Implementation Roadmap

### Week 1-2: Foundation
- [ ] Database schema for following system
- [ ] Follow/Unfollow UI on profiles
- [ ] Following/Followers list pages
- [ ] Update Firestore security rules

### Week 3-4: Feed & Discovery
- [ ] Activity feed data model
- [ ] Cloud Functions for feed generation
- [ ] Feed UI component
- [ ] "Readers Like You" discovery widget

### Week 5-6: Engagement
- [ ] Comments on highlights
- [ ] Notification system
- [ ] Email notifications (optional)
- [ ] Moderation queue

### Week 7-8: Communities
- [ ] Reading groups/clubs
- [ ] Group discussions
- [ ] Invite system

### Week 9-10: Polish
- [ ] Privacy settings dashboard
- [ ] DMs (optional)
- [ ] Reading challenges
- [ ] Analytics dashboard

---

## Success Criteria

- [ ] 30%+ of users follow at least 1 other user within first week
- [ ] 50%+ of highlights receive at least 1 like
- [ ] 20%+ of highlights receive at least 1 comment
- [ ] Feed views exceed trending highlights views by 2:1
- [ ] Month-over-month growth rate >15%
- [ ] Report rate <1% of all content
- [ ] User retention (Day 30) >40%

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|----------|
| Spam/abuse of social features | High | Robust reporting + moderation queue, rate limiting |
| Privacy backlash | High | Opt-in by default, clear privacy controls, no data selling |
| Low adoption of social features | Medium | Make following valuable (better feed), onboarding prompts |
| Increased server costs | Medium | Implement caching, optimize queries (see Architecture doc) |
| Feature creep | Medium | Stick to roadmap, validate with user feedback before building |

---

*Last Updated: 2025-11-15*
