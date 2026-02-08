/**
 * Public Link Generator for Koby
 * Creates shareable public links for highlights with short IDs
 */

import { db } from "./firebase-config.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class PublicLinkGenerator {
    constructor() {
        this.db = db;
        this.baseUrl = window.location.origin;
    }

    /**
     * Generate a short ID (base62 encoding)
     */
    generateShortId(length = 8) {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Create a public link for a highlight
     */
    async createPublicLink(highlight, userId, bookData = null) {
        try {
            console.log('[PublicLinkGenerator] Creating public link for highlight:', highlight.id);

            // Check if highlight already has a public link
            if (highlight.publicLink) {
                console.log('[PublicLinkGenerator] Using existing link:', highlight.publicLink);
                return highlight.publicLink;
            }

            // Generate unique short ID
            let shortId = this.generateShortId();
            let attempts = 0;
            const maxAttempts = 5;

            // Ensure uniqueness
            while (attempts < maxAttempts) {
                const existing = await getDoc(doc(this.db, 'publicHighlights', shortId));
                if (!existing.exists()) {
                    break;
                }
                shortId = this.generateShortId();
                attempts++;
            }

            if (attempts === maxAttempts) {
                throw new Error('Failed to generate unique short ID');
            }

            // Prepare public highlight data
            const publicHighlightData = {
                shortId: shortId,
                userId: userId,
                highlightId: highlight.id,
                text: highlight.Text || '',
                annotation: highlight.Annotation || null,
                dateCreated: highlight.date_created || new Date().toISOString(),

                // Book information
                bookTitle: bookData?.Title || highlight.bookTitle || 'Unknown Book',
                bookAuthor: bookData?.Attribution || highlight.bookAuthor || 'Unknown Author',

                // Optional metadata
                chapter: highlight.ChapterProgress || null,
                pageNumber: highlight.StartContainerPath || null,

                // Stats
                views: 0,
                createdAt: new Date().toISOString(),

                // Privacy
                visibility: 'public'
            };

            // Save to Firestore
            await setDoc(doc(this.db, 'publicHighlights', shortId), publicHighlightData);

            const publicUrl = `${this.baseUrl}/h/${shortId}`;

            console.log('[PublicLinkGenerator] Created public link:', publicUrl);

            return publicUrl;
        } catch (error) {
            console.error('[PublicLinkGenerator] Error creating public link:', error);
            throw error;
        }
    }

    /**
     * Get highlight data from short ID
     */
    async getHighlightByShortId(shortId) {
        try {
            const highlightDoc = await getDoc(doc(this.db, 'publicHighlights', shortId));

            if (!highlightDoc.exists()) {
                return null;
            }

            return highlightDoc.data();
        } catch (error) {
            console.error('[PublicLinkGenerator] Error fetching highlight:', error);
            throw error;
        }
    }

    /**
     * Increment view count for public highlight
     */
    async incrementViews(shortId) {
        try {
            const highlightRef = doc(this.db, 'publicHighlights', shortId);
            const highlightDoc = await getDoc(highlightRef);

            if (highlightDoc.exists()) {
                const currentViews = highlightDoc.data().views || 0;
                await setDoc(highlightRef, {
                    views: currentViews + 1,
                    lastViewedAt: new Date().toISOString()
                }, { merge: true });
            }
        } catch (error) {
            console.error('[PublicLinkGenerator] Error incrementing views:', error);
            // Don't throw - view counting is non-critical
        }
    }

    /**
     * Delete a public link
     */
    async deletePublicLink(shortId) {
        try {
            await setDoc(doc(this.db, 'publicHighlights', shortId), {
                visibility: 'deleted',
                deletedAt: new Date().toISOString()
            }, { merge: true });

            console.log('[PublicLinkGenerator] Deleted public link:', shortId);
        } catch (error) {
            console.error('[PublicLinkGenerator] Error deleting link:', error);
            throw error;
        }
    }

    /**
     * Share highlight with multiple options
     */
    async shareHighlight(highlight, userId, bookData, shareType = 'link') {
        try {
            const publicUrl = await this.createPublicLink(highlight, userId, bookData);

            if (shareType === 'link') {
                return this.shareAsLink(publicUrl, highlight, bookData);
            } else if (shareType === 'image') {
                return this.shareAsImage(highlight, publicUrl);
            } else {
                return publicUrl;
            }
        } catch (error) {
            console.error('[PublicLinkGenerator] Error sharing highlight:', error);
            throw error;
        }
    }

    /**
     * Share as text link (Web Share API or copy to clipboard)
     */
    async shareAsLink(url, highlight, bookData) {
        const shareData = {
            title: `${bookData?.Title || 'Book'} - ${bookData?.Attribution || 'Author'}`,
            text: highlight.Text.substring(0, 200) + (highlight.Text.length > 200 ? '...' : ''),
            url: url
        };

        // Try Web Share API first
        if (navigator.share) {
            try {
                await navigator.share(shareData);
                return { success: true, method: 'native' };
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.log('[PublicLinkGenerator] Web Share API failed, falling back to clipboard');
                }
            }
        }

        // Fallback to clipboard
        try {
            await navigator.clipboard.writeText(url);
            return { success: true, method: 'clipboard', url };
        } catch (err) {
            console.error('[PublicLinkGenerator] Clipboard failed:', err);
            return { success: false, url };
        }
    }

    /**
     * Share as quote image (delegates to QuoteImageGenerator)
     */
    async shareAsImage(highlight, publicUrl) {
        if (window.quoteGenerator) {
            return await window.quoteGenerator.share(highlight, 'minimalist', publicUrl);
        } else {
            throw new Error('QuoteImageGenerator not loaded');
        }
    }
}

// Create global instance
window.publicLinkGenerator = new PublicLinkGenerator();
