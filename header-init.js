/**
 * Header Initialization Module
 * Loads the shared header and initializes navigation links
 */

import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

/**
 * Load header HTML and initialize navigation links
 * @param {string} headerElementId - ID of the header element (default: 'header')
 */
export async function initializeHeader(headerElementId = 'header') {
    try {
        // Load header HTML
        const response = await fetch('/header.html');
        const headerHTML = await response.text();
        const headerElement = document.getElementById(headerElementId) || document.querySelector('header');

        if (headerElement) {
            headerElement.innerHTML = headerHTML;
        } else {
            console.warn('[HeaderInit] No header element found');
            return;
        }

        // Wait for auth state and initialize nav links
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                initializeNavLinks(user);
            }
        });

    } catch (error) {
        console.error('[HeaderInit] Error loading header:', error);
    }
}

/**
 * Initialize navigation links visibility based on auth state
 */
function initializeNavLinks(user) {
    if (!user) return;

    // Show all nav links for logged-in users
    const navLinks = [
        'feed-link',
        'groups-link',
        'search-link',
        'stats-link',
        'settings-link'
    ];

    navLinks.forEach(linkId => {
        const link = document.getElementById(linkId);
        if (link) {
            link.style.display = 'flex';
        }
    });

    // Update user profile section with minimal UI
    // (for pages that don't use script.js, we show a simplified version)
    const userProfileContainer = document.getElementById('user-profile');
    if (userProfileContainer && userProfileContainer.children.length === 0) {
        const homeLink = document.createElement('a');
        homeLink.href = `/user/${user.uid}`;
        homeLink.textContent = 'My Profile';
        homeLink.style.cssText = 'color: #4CAF50; text-decoration: none; font-weight: 500;';
        userProfileContainer.appendChild(homeLink);
    }
}

// Auto-initialize when DOM is ready if this script is included
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initializeHeader());
} else {
    initializeHeader();
}
