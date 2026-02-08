/**
 * Analytics Manager for Koby
 * Handles reading statistics, streaks, and insights
 */

import { db, auth } from "./firebase-config.js";
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class AnalyticsManager {
    constructor() {
        this.db = db;
        this.auth = auth;
    }

    /**
     * Calculate and update reading streak
     */
    async updateStreak(userId) {
        try {
            console.log('[AnalyticsManager] Updating streak for user:', userId);

            const userRef = doc(this.db, 'users', userId);
            const userDoc = await getDoc(userRef);
            const userData = userDoc.data() || {};

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const lastReadDate = userData.lastReadDate ? userData.lastReadDate.toDate() : null;

            if (lastReadDate) {
                lastReadDate.setHours(0, 0, 0, 0);
            }

            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            let currentStreak = userData.currentStreak || 0;
            let longestStreak = userData.longestStreak || 0;

            // If last read was today, no change
            if (lastReadDate && lastReadDate.getTime() === today.getTime()) {
                return { currentStreak, longestStreak };
            }

            // If last read was yesterday, increment streak
            if (lastReadDate && lastReadDate.getTime() === yesterday.getTime()) {
                currentStreak += 1;
            }
            // If last read was before yesterday, reset streak
            else if (lastReadDate && lastReadDate.getTime() < yesterday.getTime()) {
                currentStreak = 1;
            }
            // If never read before, start streak
            else {
                currentStreak = 1;
            }

            // Update longest streak if needed
            if (currentStreak > longestStreak) {
                longestStreak = currentStreak;
            }

            // Update Firestore
            await updateDoc(userRef, {
                currentStreak,
                longestStreak,
                lastReadDate: serverTimestamp()
            });

            console.log('[AnalyticsManager] Streak updated:', { currentStreak, longestStreak });

            return { currentStreak, longestStreak };

        } catch (error) {
            console.error('[AnalyticsManager] Error updating streak:', error);
            return { currentStreak: 0, longestStreak: 0 };
        }
    }

    /**
     * Get user's reading statistics
     */
    async getUserStats(userId) {
        try {
            console.log('[AnalyticsManager] Loading stats for user:', userId);

            // Get all user's books
            const booksQuery = query(
                collection(this.db, 'users', userId, 'books')
            );
            const booksSnapshot = await getDocs(booksQuery);

            // Get all user's highlights
            const highlightsQuery = query(
                collection(this.db, 'users', userId, 'highlights')
            );
            const highlightsSnapshot = await getDocs(highlightsQuery);

            // Calculate stats
            let totalBooks = 0;
            let finishedBooks = 0;
            let totalReadingTime = 0;
            let totalWords = 0;
            const genreMap = new Map();
            const seriesMap = new Map();
            const authorMap = new Map();

            booksSnapshot.docs.forEach(doc => {
                const book = doc.data();
                totalBooks++;

                if (book.percent_read >= 100) {
                    finishedBooks++;
                }

                totalReadingTime += book.time_spent_reading || 0;
                totalWords += book.word_count || 0;

                // Track series
                if (book.series) {
                    seriesMap.set(book.series, (seriesMap.get(book.series) || 0) + 1);
                }
            });

            const totalHighlights = highlightsSnapshot.docs.length;

            // Get highlights by book for genre analysis
            const highlightsByBook = new Map();
            highlightsSnapshot.docs.forEach(doc => {
                const highlight = doc.data();
                const title = highlight.title || 'Unknown';
                highlightsByBook.set(title, (highlightsByBook.get(title) || 0) + 1);
            });

            // Get user document for streak info
            const userDoc = await getDoc(doc(this.db, 'users', userId));
            const userData = userDoc.data() || {};

            const stats = {
                totalBooks,
                finishedBooks,
                totalHighlights,
                totalReadingTime: Math.round(totalReadingTime / 1000 / 60), // Convert to minutes
                totalWords,
                averageWordsPerBook: totalBooks > 0 ? Math.round(totalWords / totalBooks) : 0,
                currentStreak: userData.currentStreak || 0,
                longestStreak: userData.longestStreak || 0,
                highlightsPerBook: totalBooks > 0 ? (totalHighlights / totalBooks).toFixed(1) : 0,
                completionRate: totalBooks > 0 ? Math.round((finishedBooks / totalBooks) * 100) : 0,
                topSeries: Array.from(seriesMap.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([name, count]) => ({ name, count })),
                topBooks: Array.from(highlightsByBook.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([title, count]) => ({ title, count }))
            };

            console.log('[AnalyticsManager] Stats loaded:', stats);
            return stats;

        } catch (error) {
            console.error('[AnalyticsManager] Error loading stats:', error);
            return {
                totalBooks: 0,
                finishedBooks: 0,
                totalHighlights: 0,
                totalReadingTime: 0,
                totalWords: 0,
                averageWordsPerBook: 0,
                currentStreak: 0,
                longestStreak: 0,
                highlightsPerBook: 0,
                completionRate: 0,
                topSeries: [],
                topBooks: []
            };
        }
    }

    /**
     * Get reading activity by month
     */
    async getReadingActivity(userId, year = new Date().getFullYear()) {
        try {
            console.log('[AnalyticsManager] Loading activity for year:', year);

            // Get all highlights from this year
            const startOfYear = new Date(year, 0, 1);
            const endOfYear = new Date(year, 11, 31, 23, 59, 59);

            const highlightsQuery = query(
                collection(this.db, 'users', userId, 'highlights'),
                where('date_created', '>=', startOfYear),
                where('date_created', '<=', endOfYear),
                orderBy('date_created', 'desc')
            );

            const snapshot = await getDocs(highlightsQuery);

            // Count by month
            const monthCounts = new Array(12).fill(0);
            const dayActivity = new Map(); // Map of date string -> count

            snapshot.docs.forEach(doc => {
                const highlight = doc.data();
                const date = highlight.date_created?.toDate();

                if (date) {
                    const month = date.getMonth();
                    monthCounts[month]++;

                    // Count by day
                    const dayKey = date.toISOString().split('T')[0];
                    dayActivity.set(dayKey, (dayActivity.get(dayKey) || 0) + 1);
                }
            });

            // Calculate streak calendar data
            const today = new Date();
            const last90Days = [];

            for (let i = 89; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dayKey = date.toISOString().split('T')[0];

                last90Days.push({
                    date: dayKey,
                    count: dayActivity.get(dayKey) || 0,
                    day: date.getDay()
                });
            }

            return {
                monthCounts,
                totalThisYear: snapshot.docs.length,
                last90Days
            };

        } catch (error) {
            console.error('[AnalyticsManager] Error loading activity:', error);
            return {
                monthCounts: new Array(12).fill(0),
                totalThisYear: 0,
                last90Days: []
            };
        }
    }

    /**
     * Get reading insights
     */
    async getInsights(userId) {
        try {
            console.log('[AnalyticsManager] Generating insights');

            const stats = await this.getUserStats(userId);
            const activity = await this.getReadingActivity(userId);

            const insights = [];

            // Streak insights
            if (stats.currentStreak >= 7) {
                insights.push({
                    type: 'achievement',
                    icon: 'fire',
                    title: `${stats.currentStreak} Day Streak!`,
                    description: 'You\'re on fire! Keep the momentum going.',
                    color: '#ff6b6b'
                });
            }

            if (stats.longestStreak >= 30) {
                insights.push({
                    type: 'achievement',
                    icon: 'trophy',
                    title: 'Streak Master',
                    description: `Your longest streak is ${stats.longestStreak} days!`,
                    color: '#ffd93d'
                });
            }

            // Reading volume insights
            if (stats.totalHighlights >= 100) {
                insights.push({
                    type: 'milestone',
                    icon: 'bookmark',
                    title: 'Highlight Collector',
                    description: `You've saved ${stats.totalHighlights} highlights!`,
                    color: '#4CAF50'
                });
            }

            if (stats.finishedBooks >= 10) {
                insights.push({
                    type: 'milestone',
                    icon: 'book',
                    title: 'Bookworm',
                    description: `${stats.finishedBooks} books completed!`,
                    color: '#2196F3'
                });
            }

            // Engagement insights
            if (stats.highlightsPerBook > 10) {
                insights.push({
                    type: 'insight',
                    icon: 'lightbulb',
                    title: 'Active Reader',
                    description: `You average ${stats.highlightsPerBook} highlights per book.`,
                    color: '#9c27b0'
                });
            }

            // Most highlighted book
            if (stats.topBooks && stats.topBooks.length > 0) {
                const topBook = stats.topBooks[0];
                insights.push({
                    type: 'insight',
                    icon: 'star',
                    title: 'Favorite Book',
                    description: `"${topBook.title}" has ${topBook.count} highlights!`,
                    color: '#ff9800'
                });
            }

            return insights;

        } catch (error) {
            console.error('[AnalyticsManager] Error generating insights:', error);
            return [];
        }
    }

    /**
     * Get streak calendar data for visualization
     */
    getStreakCalendar(last90Days) {
        // Group by week for display
        const weeks = [];
        let currentWeek = [];

        last90Days.forEach((day, index) => {
            currentWeek.push(day);

            // Sunday (day 0) is end of week
            if (day.day === 0 || index === last90Days.length - 1) {
                weeks.push([...currentWeek]);
                currentWeek = [];
            }
        });

        return weeks;
    }

    /**
     * Format reading time
     */
    formatReadingTime(minutes) {
        if (minutes < 60) {
            return `${minutes}m`;
        }

        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;

        if (hours < 24) {
            return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        }

        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;

        return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    }

    /**
     * Calculate reading speed (words per minute)
     */
    calculateReadingSpeed(totalWords, totalMinutes) {
        if (totalMinutes === 0) return 0;
        return Math.round(totalWords / totalMinutes);
    }
}

// Create global instance
window.analyticsManager = new AnalyticsManager();

console.log('[AnalyticsManager] Initialized');
