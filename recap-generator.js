/**
 * Recap Generator for Koby
 * Generates annual reading recaps (like Spotify Wrapped)
 */

import { db, auth } from "./firebase-config.js";
import { collection, query, where, orderBy, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class RecapGenerator {
    constructor() {
        this.db = db;
        this.auth = auth;
    }

    /**
     * Generate annual recap for a specific year
     */
    async generateRecap(userId, year = new Date().getFullYear()) {
        try {
            console.log('[RecapGenerator] Generating recap for year:', year);

            const startOfYear = new Date(year, 0, 1);
            const endOfYear = new Date(year, 11, 31, 23, 59, 59);

            // Get all highlights from the year
            const highlightsQuery = query(
                collection(this.db, 'users', userId, 'highlights'),
                where('date_created', '>=', Timestamp.fromDate(startOfYear)),
                where('date_created', '<=', Timestamp.fromDate(endOfYear)),
                orderBy('date_created', 'asc')
            );

            const highlightsSnapshot = await getDocs(highlightsQuery);
            const highlights = highlightsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date_created: doc.data().date_created?.toDate()
            }));

            // Get books data
            const booksData = this.analyzeBooks(highlights);

            // Get reading patterns
            const patterns = this.analyzePatterns(highlights);

            // Get top moments
            const topMoments = this.getTopMoments(highlights);

            // Calculate streaks
            const streakData = this.analyzeStreaks(highlights);

            // Determine reading personality
            const personality = this.determinePersonality(highlights, booksData, patterns);

            const recap = {
                year,
                totalHighlights: highlights.length,
                ...booksData,
                ...patterns,
                topMoments,
                streakData,
                personality,
                firstHighlight: highlights[0],
                lastHighlight: highlights[highlights.length - 1]
            };

            console.log('[RecapGenerator] Recap generated:', recap);
            return recap;

        } catch (error) {
            console.error('[RecapGenerator] Error generating recap:', error);
            return null;
        }
    }

    /**
     * Analyze books from highlights
     */
    analyzeBooks(highlights) {
        const bookMap = new Map();

        highlights.forEach(highlight => {
            const title = highlight.title || 'Unknown';
            const author = highlight.attribution || 'Unknown Author';

            if (!bookMap.has(title)) {
                bookMap.set(title, {
                    title,
                    author,
                    count: 0,
                    highlights: []
                });
            }

            const book = bookMap.get(title);
            book.count++;
            book.highlights.push(highlight);
        });

        const books = Array.from(bookMap.values());

        // Sort by highlight count
        books.sort((a, b) => b.count - a.count);

        return {
            uniqueBooks: books.length,
            mostHighlightedBook: books[0] || null,
            topBooks: books.slice(0, 5),
            allBooks: books
        };
    }

    /**
     * Analyze reading patterns
     */
    analyzePatterns(highlights) {
        const monthCounts = new Array(12).fill(0);
        const dayCounts = new Array(7).fill(0);
        const hourCounts = new Array(24).fill(0);

        highlights.forEach(highlight => {
            const date = highlight.date_created;
            if (date) {
                monthCounts[date.getMonth()]++;
                dayCounts[date.getDay()]++;
                hourCounts[date.getHours()]++;
            }
        });

        // Find peak month
        const peakMonthIndex = monthCounts.indexOf(Math.max(...monthCounts));
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        // Find peak day
        const peakDayIndex = dayCounts.indexOf(Math.max(...dayCounts));
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        // Find peak hour
        const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

        // Determine time of day preference
        let timePreference = 'night owl';
        if (peakHour >= 6 && peakHour < 12) timePreference = 'morning reader';
        else if (peakHour >= 12 && peakHour < 18) timePreference = 'afternoon reader';
        else if (peakHour >= 18 && peakHour < 22) timePreference = 'evening reader';

        return {
            peakMonth: months[peakMonthIndex],
            peakDay: days[peakDayIndex],
            peakHour,
            timePreference,
            monthCounts,
            dayCounts
        };
    }

    /**
     * Get top moments (longest highlights, etc.)
     */
    getTopMoments(highlights) {
        // Longest highlight
        const sorted = [...highlights].sort((a, b) =>
            (b.text?.length || 0) - (a.text?.length || 0)
        );

        return {
            longestHighlight: sorted[0] || null,
            shortestHighlight: sorted[sorted.length - 1] || null
        };
    }

    /**
     * Analyze reading streaks
     */
    analyzeStreaks(highlights) {
        if (highlights.length === 0) {
            return {
                longestStreak: 0,
                totalDaysRead: 0,
                consistencyScore: 0
            };
        }

        // Get unique days
        const daysSet = new Set();
        highlights.forEach(h => {
            if (h.date_created) {
                const dayKey = h.date_created.toISOString().split('T')[0];
                daysSet.add(dayKey);
            }
        });

        const days = Array.from(daysSet).sort();

        // Calculate longest streak
        let longestStreak = 1;
        let currentStreak = 1;

        for (let i = 1; i < days.length; i++) {
            const prevDate = new Date(days[i - 1]);
            const currDate = new Date(days[i]);
            const diffDays = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                currentStreak++;
                longestStreak = Math.max(longestStreak, currentStreak);
            } else {
                currentStreak = 1;
            }
        }

        const totalDaysRead = days.length;
        const totalDaysInYear = 365;
        const consistencyScore = Math.round((totalDaysRead / totalDaysInYear) * 100);

        return {
            longestStreak,
            totalDaysRead,
            consistencyScore
        };
    }

    /**
     * Determine reading personality based on behavior
     */
    determinePersonality(highlights, booksData, patterns) {
        const avgHighlightsPerBook = highlights.length / (booksData.uniqueBooks || 1);

        let personality = {
            type: '',
            description: '',
            emoji: ''
        };

        // Determine personality type
        if (avgHighlightsPerBook > 15) {
            personality = {
                type: 'The Deep Diver',
                description: 'You love to thoroughly explore every page, extracting wisdom and insights.',
                emoji: '🤿'
            };
        } else if (avgHighlightsPerBook < 5 && booksData.uniqueBooks > 10) {
            personality = {
                type: 'The Explorer',
                description: 'You enjoy sampling many books, always searching for new ideas.',
                emoji: '🧭'
            };
        } else if (patterns.timePreference === 'night owl') {
            personality = {
                type: 'The Night Owl',
                description: 'Your best reading happens when the world is quiet and the stars are out.',
                emoji: '🦉'
            };
        } else if (patterns.timePreference === 'morning reader') {
            personality = {
                type: 'The Early Bird',
                description: 'You start your day with wisdom, reading before the world wakes up.',
                emoji: '🌅'
            };
        } else if (highlights.length > 200) {
            personality = {
                type: 'The Collector',
                description: 'Every meaningful passage deserves to be saved. You\'re building a library of wisdom.',
                emoji: '📚'
            };
        } else {
            personality = {
                type: 'The Mindful Reader',
                description: 'You read with intention, carefully selecting what resonates most.',
                emoji: '🧘'
            };
        }

        return personality;
    }

    /**
     * Get available years (years with data)
     */
    async getAvailableYears(userId) {
        try {
            const highlightsQuery = query(
                collection(this.db, 'users', userId, 'highlights'),
                orderBy('date_created', 'asc')
            );

            const snapshot = await getDocs(highlightsQuery);

            if (snapshot.empty) return [];

            const years = new Set();
            snapshot.docs.forEach(doc => {
                const date = doc.data().date_created?.toDate();
                if (date) {
                    years.add(date.getFullYear());
                }
            });

            return Array.from(years).sort((a, b) => b - a);

        } catch (error) {
            console.error('[RecapGenerator] Error getting available years:', error);
            return [];
        }
    }

    /**
     * Generate fun facts for the year
     */
    generateFunFacts(recap) {
        const facts = [];

        // Highlight volume
        if (recap.totalHighlights > 100) {
            facts.push(`You saved ${recap.totalHighlights} highlights this year! That's enough to fill a book.`);
        }

        // Book diversity
        if (recap.uniqueBooks > 20) {
            facts.push(`You explored ${recap.uniqueBooks} different books. What a journey!`);
        }

        // Consistency
        if (recap.streakData.consistencyScore > 50) {
            facts.push(`You read on ${recap.streakData.totalDaysRead} different days. Reading is clearly a habit for you!`);
        }

        // Streak achievement
        if (recap.streakData.longestStreak >= 30) {
            facts.push(`Your longest reading streak was ${recap.streakData.longestStreak} days. Incredible dedication!`);
        }

        // Peak reading time
        facts.push(`Most of your reading happened in ${recap.peakMonth}. It must have been a great month!`);

        // Favorite book
        if (recap.mostHighlightedBook) {
            facts.push(`"${recap.mostHighlightedBook.title}" captivated you the most with ${recap.mostHighlightedBook.count} highlights.`);
        }

        return facts;
    }
}

// Create global instance
window.recapGenerator = new RecapGenerator();

console.log('[RecapGenerator] Initialized');
