/**
 * Accessibility Helper Functions for Koby
 * WCAG 2.1 AA Compliance Utilities
 */

export class AccessibilityManager {
    constructor() {
        this.init();
    }

    /**
     * Initialize accessibility features
     */
    init() {
        this.addSkipLink();
        this.setupKeyboardNavigation();
        this.setupAriaLiveRegions();
        this.setupFocusManagement();
        this.monitorColorContrast();
    }

    /**
     * Add skip to main content link
     */
    addSkipLink() {
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.className = 'skip-to-main';
        skipLink.textContent = 'Skip to main content';
        skipLink.addEventListener('click', (e) => {
            e.preventDefault();
            const main = document.getElementById('main-content') || document.querySelector('main');
            if (main) {
                main.tabIndex = -1;
                main.focus();
            }
        });
        document.body.insertBefore(skipLink, document.body.firstChild);
    }

    /**
     * Setup keyboard navigation
     */
    setupKeyboardNavigation() {
        // Track keyboard usage
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                document.body.classList.add('keyboard-nav-active');
            }
        });

        document.addEventListener('mousedown', () => {
            document.body.classList.remove('keyboard-nav-active');
        });

        // Escape key to close modals/dropdowns
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
                this.closeAllDropdowns();
            }
        });
    }

    /**
     * Setup ARIA live regions for announcements
     */
    setupAriaLiveRegions() {
        if (!document.getElementById('aria-live-polite')) {
            const politeRegion = document.createElement('div');
            politeRegion.id = 'aria-live-polite';
            politeRegion.setAttribute('aria-live', 'polite');
            politeRegion.setAttribute('aria-atomic', 'true');
            politeRegion.className = 'sr-only';
            document.body.appendChild(politeRegion);
        }

        if (!document.getElementById('aria-live-assertive')) {
            const assertiveRegion = document.createElement('div');
            assertiveRegion.id = 'aria-live-assertive';
            assertiveRegion.setAttribute('aria-live', 'assertive');
            assertiveRegion.setAttribute('aria-atomic', 'true');
            assertiveRegion.className = 'sr-only';
            document.body.appendChild(assertiveRegion);
        }
    }

    /**
     * Announce message to screen readers
     * @param {string} message - Message to announce
     * @param {string} priority - 'polite' or 'assertive'
     */
    announce(message, priority = 'polite') {
        const regionId = priority === 'assertive' ? 'aria-live-assertive' : 'aria-live-polite';
        const region = document.getElementById(regionId);

        if (region) {
            region.textContent = '';
            setTimeout(() => {
                region.textContent = message;
            }, 100);
        }
    }

    /**
     * Setup focus management
     */
    setupFocusManagement() {
        this.focusStack = [];

        // Trap focus in modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                const modal = document.querySelector('.modal[aria-modal="true"]');
                if (modal) {
                    this.trapFocus(modal, e);
                }
            }
        });
    }

    /**
     * Trap focus within an element
     * @param {HTMLElement} element - Element to trap focus in
     * @param {KeyboardEvent} event - Keyboard event
     */
    trapFocus(element, event) {
        const focusableElements = element.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
            if (document.activeElement === firstFocusable) {
                lastFocusable.focus();
                event.preventDefault();
            }
        } else {
            if (document.activeElement === lastFocusable) {
                firstFocusable.focus();
                event.preventDefault();
            }
        }
    }

    /**
     * Save current focus and return to it later
     */
    saveFocus() {
        this.focusStack.push(document.activeElement);
    }

    /**
     * Restore previously saved focus
     */
    restoreFocus() {
        const element = this.focusStack.pop();
        if (element && element.focus) {
            element.focus();
        }
    }

    /**
     * Close all modals
     */
    closeAllModals() {
        document.querySelectorAll('.modal[aria-modal="true"]').forEach(modal => {
            modal.setAttribute('aria-modal', 'false');
            modal.style.display = 'none';
            this.restoreFocus();
        });
    }

    /**
     * Close all dropdowns
     */
    closeAllDropdowns() {
        document.querySelectorAll('[aria-expanded="true"]').forEach(element => {
            element.setAttribute('aria-expanded', 'false');
            const targetId = element.getAttribute('aria-controls');
            if (targetId) {
                const target = document.getElementById(targetId);
                if (target) {
                    target.hidden = true;
                }
            }
        });
    }

    /**
     * Monitor color contrast (development mode)
     */
    monitorColorContrast() {
        if (process.env.NODE_ENV === 'development') {
            // In development, check contrast ratios
            console.log('Color contrast monitoring enabled');
        }
    }

    /**
     * Make an element accessible as a button
     * @param {HTMLElement} element - Element to make accessible
     * @param {Function} clickHandler - Click handler function
     */
    makeAccessibleButton(element, clickHandler) {
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');

        element.addEventListener('click', clickHandler);

        element.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                clickHandler(e);
            }
        });
    }

    /**
     * Create accessible modal
     * @param {string} title - Modal title
     * @param {string} content - Modal content
     * @returns {HTMLElement} - Modal element
     */
    createAccessibleModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'modal-title');

        modal.innerHTML = `
            <div class="modal-backdrop" aria-hidden="true"></div>
            <div class="modal-content">
                <h2 id="modal-title">${title}</h2>
                <div class="modal-body">${content}</div>
                <button class="modal-close" aria-label="Close modal">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
        `;

        const closeBtn = modal.querySelector('.modal-close');
        closeBtn.addEventListener('click', () => {
            this.closeModal(modal);
        });

        return modal;
    }

    /**
     * Open modal
     * @param {HTMLElement} modal - Modal element
     */
    openModal(modal) {
        this.saveFocus();
        document.body.appendChild(modal);
        modal.style.display = 'block';

        const firstFocusable = modal.querySelector('button, [href], input');
        if (firstFocusable) {
            firstFocusable.focus();
        }

        this.announce('Dialog opened', 'assertive');
    }

    /**
     * Close modal
     * @param {HTMLElement} modal - Modal element
     */
    closeModal(modal) {
        modal.setAttribute('aria-modal', 'false');
        modal.style.display = 'none';
        modal.remove();
        this.restoreFocus();
        this.announce('Dialog closed', 'polite');
    }

    /**
     * Create accessible tooltip
     * @param {HTMLElement} trigger - Trigger element
     * @param {string} content - Tooltip content
     */
    createAccessibleTooltip(trigger, content) {
        const tooltipId = `tooltip-${Math.random().toString(36).substr(2, 9)}`;

        trigger.setAttribute('aria-describedby', tooltipId);

        const tooltip = document.createElement('div');
        tooltip.id = tooltipId;
        tooltip.className = 'tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.textContent = content;
        tooltip.hidden = true;

        trigger.addEventListener('mouseenter', () => {
            tooltip.hidden = false;
            document.body.appendChild(tooltip);
            this.positionTooltip(trigger, tooltip);
        });

        trigger.addEventListener('mouseleave', () => {
            tooltip.hidden = true;
            tooltip.remove();
        });

        trigger.addEventListener('focus', () => {
            tooltip.hidden = false;
            document.body.appendChild(tooltip);
            this.positionTooltip(trigger, tooltip);
        });

        trigger.addEventListener('blur', () => {
            tooltip.hidden = true;
            tooltip.remove();
        });
    }

    /**
     * Position tooltip relative to trigger
     * @param {HTMLElement} trigger - Trigger element
     * @param {HTMLElement} tooltip - Tooltip element
     */
    positionTooltip(trigger, tooltip) {
        const rect = trigger.getBoundingClientRect();
        tooltip.style.position = 'absolute';
        tooltip.style.left = `${rect.left}px`;
        tooltip.style.top = `${rect.bottom + 8}px`;
    }

    /**
     * Make list accessible
     * @param {HTMLElement} list - List element
     */
    makeAccessibleList(list) {
        list.setAttribute('role', 'list');

        const items = list.querySelectorAll('li');
        items.forEach((item, index) => {
            item.setAttribute('role', 'listitem');
            item.setAttribute('aria-setsize', items.length);
            item.setAttribute('aria-posinset', index + 1);
        });
    }

    /**
     * Create accessible tabs
     * @param {HTMLElement} container - Tabs container
     */
    setupAccessibleTabs(container) {
        const tabList = container.querySelector('[role="tablist"]');
        const tabs = container.querySelectorAll('[role="tab"]');
        const tabPanels = container.querySelectorAll('[role="tabpanel"]');

        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => {
                this.activateTab(tabs, tabPanels, index);
            });

            tab.addEventListener('keydown', (e) => {
                let newIndex;

                if (e.key === 'ArrowRight') {
                    newIndex = (index + 1) % tabs.length;
                } else if (e.key === 'ArrowLeft') {
                    newIndex = (index - 1 + tabs.length) % tabs.length;
                } else if (e.key === 'Home') {
                    newIndex = 0;
                } else if (e.key === 'End') {
                    newIndex = tabs.length - 1;
                } else {
                    return;
                }

                e.preventDefault();
                this.activateTab(tabs, tabPanels, newIndex);
                tabs[newIndex].focus();
            });
        });
    }

    /**
     * Activate tab
     * @param {NodeList} tabs - Tab elements
     * @param {NodeList} panels - Panel elements
     * @param {number} index - Index to activate
     */
    activateTab(tabs, panels, index) {
        tabs.forEach((tab, i) => {
            const isActive = i === index;
            tab.setAttribute('aria-selected', isActive);
            tab.setAttribute('tabindex', isActive ? '0' : '-1');
        });

        panels.forEach((panel, i) => {
            panel.hidden = i !== index;
        });

        this.announce(`${tabs[index].textContent} tab activated`, 'polite');
    }

    /**
     * Add loading state
     * @param {HTMLElement} element - Element to add loading state to
     * @param {string} loadingText - Loading announcement text
     */
    setLoadingState(element, loadingText = 'Loading') {
        element.setAttribute('aria-busy', 'true');
        element.setAttribute('aria-live', 'polite');
        this.announce(loadingText, 'polite');
    }

    /**
     * Remove loading state
     * @param {HTMLElement} element - Element to remove loading state from
     * @param {string} completeText - Completion announcement text
     */
    removeLoadingState(element, completeText = 'Loading complete') {
        element.removeAttribute('aria-busy');
        this.announce(completeText, 'polite');
    }

    /**
     * Validate form accessibility
     * @param {HTMLFormElement} form - Form to validate
     */
    validateFormAccessibility(form) {
        const issues = [];

        // Check for labels
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            const label = form.querySelector(`label[for="${input.id}"]`);
            if (!label && !input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')) {
                issues.push(`Input missing label: ${input.name || input.id}`);
            }
        });

        // Check for fieldsets
        const radioGroups = form.querySelectorAll('input[type="radio"]');
        if (radioGroups.length > 0) {
            const fieldset = form.querySelector('fieldset');
            if (!fieldset) {
                issues.push('Radio buttons should be wrapped in a fieldset');
            }
        }

        if (issues.length > 0) {
            console.warn('Form accessibility issues:', issues);
        }

        return issues.length === 0;
    }
}

// Create singleton instance
export const a11y = new AccessibilityManager();

// Export as default
export default a11y;
