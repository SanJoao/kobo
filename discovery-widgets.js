/**
 * Discovery Widgets for Koby
 * UI components for user recommendations
 */

import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export class DiscoveryWidgets {
    constructor() {
        this.auth = getAuth();
        this.isLoading = false;
    }

    /**
     * Initialize all discovery widgets on the page
     */
    async initializeWidgets(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('[DiscoveryWidgets] Container not found:', containerId);
            return;
        }

        const currentUser = this.auth.currentUser;
        if (!currentUser) {
            container.innerHTML = `
                <div class="discovery-widgets">
                    <div class="discovery-widget">
                        <h3>Discover Readers</h3>
                        <p class="discovery-empty">Sign in to discover readers like you!</p>
                        <a href="/login.html" class="btn-primary">Sign In</a>
                    </div>
                </div>
            `;
            return;
        }

        // Show loading state
        container.innerHTML = `
            <div class="discovery-widgets">
                <div class="discovery-widget">
                    <div class="discovery-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Finding readers for you...</p>
                    </div>
                </div>
            </div>
        `;

        await this.loadAllWidgets(container, currentUser.uid);
    }

    /**
     * Load all discovery widgets
     */
    async loadAllWidgets(container, userId) {
        try {
            this.isLoading = true;

            // Load recommendations in parallel
            const [readersLikeYou, popularInNetwork, trending] = await Promise.all([
                window.userDiscovery.getReadersLikeYou(userId, 3),
                window.userDiscovery.getPopularInNetwork(userId, 3),
                window.userDiscovery.getTrendingUsers(userId, 3)
            ]);

            let widgetsHTML = '<div class="discovery-widgets">';

            // Readers Like You widget
            if (readersLikeYou.length > 0) {
                widgetsHTML += this.renderReadersLikeYouWidget(readersLikeYou);
            }

            // Popular in Network widget
            if (popularInNetwork.length > 0) {
                widgetsHTML += this.renderPopularInNetworkWidget(popularInNetwork);
            }

            // Trending widget (fallback if no other recommendations)
            if (readersLikeYou.length === 0 && popularInNetwork.length === 0 && trending.length > 0) {
                widgetsHTML += this.renderTrendingWidget(trending);
            }

            // If no recommendations at all
            if (readersLikeYou.length === 0 && popularInNetwork.length === 0 && trending.length === 0) {
                widgetsHTML += `
                    <div class="discovery-widget">
                        <div class="discovery-empty">
                            <i class="fas fa-user-friends"></i>
                            <p>No recommendations yet</p>
                            <p class="discovery-empty-hint">Upload more books to find readers like you!</p>
                        </div>
                    </div>
                `;
            }

            widgetsHTML += '</div>';

            container.innerHTML = widgetsHTML;
            this.isLoading = false;

        } catch (error) {
            console.error('[DiscoveryWidgets] Error loading widgets:', error);
            container.innerHTML = `
                <div class="discovery-widgets">
                    <div class="discovery-widget">
                        <p class="discovery-error">Error loading recommendations</p>
                    </div>
                </div>
            `;
            this.isLoading = false;
        }
    }

    /**
     * Render "Readers Like You" widget
     */
    renderReadersLikeYouWidget(users) {
        let html = `
            <div class="discovery-widget">
                <div class="discovery-widget-header">
                    <h3><i class="fas fa-book-reader"></i> Readers Like You</h3>
                    <p class="discovery-widget-subtitle">People who read similar books</p>
                </div>
                <div class="discovery-user-list">
        `;

        users.forEach(user => {
            html += window.userDiscovery.renderUserCard(user, true);
        });

        html += `
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Render "Popular in Your Network" widget
     */
    renderPopularInNetworkWidget(users) {
        let html = `
            <div class="discovery-widget">
                <div class="discovery-widget-header">
                    <h3><i class="fas fa-users"></i> Popular in Your Network</h3>
                    <p class="discovery-widget-subtitle">Followed by people you follow</p>
                </div>
                <div class="discovery-user-list">
        `;

        users.forEach(user => {
            html += window.userDiscovery.renderUserCard(user, true);
        });

        html += `
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Render "Trending Users" widget
     */
    renderTrendingWidget(users) {
        let html = `
            <div class="discovery-widget">
                <div class="discovery-widget-header">
                    <h3><i class="fas fa-fire"></i> Trending Readers</h3>
                    <p class="discovery-widget-subtitle">Active readers on Koby</p>
                </div>
                <div class="discovery-user-list">
        `;

        users.forEach(user => {
            html += window.userDiscovery.renderUserCard(user, true);
        });

        html += `
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Refresh all widgets
     */
    async refresh(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const currentUser = this.auth.currentUser;
        if (!currentUser) return;

        // Clear cache and reload
        window.userDiscovery.clearCache();
        await this.loadAllWidgets(container, currentUser.uid);
    }
}

// Create global instance
window.discoveryWidgets = new DiscoveryWidgets();

// Global refresh function
window.refreshDiscoveryWidgets = async function() {
    if (window.discoveryWidgets) {
        await window.discoveryWidgets.refresh('discovery-widgets-container');
    }
};

console.log('[DiscoveryWidgets] Initialized');
