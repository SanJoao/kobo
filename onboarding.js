/**
 * Onboarding Flow for Koby
 * Guides new users through the application features
 */

export class OnboardingManager {
    constructor() {
        this.currentStep = 0;
        this.steps = [];
        this.overlay = null;
        this.tooltip = null;
        this.completed = false;
    }

    /**
     * Initialize onboarding
     */
    async init() {
        // Check if user has completed onboarding
        const hasCompleted = localStorage.getItem('onboarding_completed');

        if (hasCompleted) {
            this.completed = true;
            return;
        }

        // Define onboarding steps
        this.steps = [
            {
                title: 'Welcome to Koby! 📚',
                content: 'Your personal space for Kobo e-reader highlights. Let\'s take a quick tour!',
                element: null,
                position: 'center'
            },
            {
                title: 'Upload Your Highlights',
                content: 'Click here to upload your Kobo database and start viewing your highlights.',
                element: '#landing-upload-btn',
                position: 'bottom'
            },
            {
                title: 'Choose Privacy Mode',
                content: 'You can process your data offline, keep it private, or share it publicly. Your choice!',
                element: null,
                position: 'center',
                action: () => {
                    // Could navigate to upload page
                }
            },
            {
                title: 'View Your Stats',
                content: 'See beautiful visualizations of your reading habits and patterns.',
                element: '#dashboard',
                position: 'top'
            },
            {
                title: 'Export to PKM Tools',
                content: 'Export your highlights to Obsidian, Notion, or other note-taking apps.',
                element: null,
                position: 'center'
            },
            {
                title: 'Connect with Readers',
                content: 'Follow other readers, discover new books, and share your favorite quotes!',
                element: null,
                position: 'center'
            },
            {
                title: 'You\'re All Set! 🎉',
                content: 'Ready to explore your reading journey? Let\'s get started!',
                element: null,
                position: 'center'
            }
        ];
    }

    /**
     * Start onboarding tour
     */
    async start() {
        if (this.completed) {
            return;
        }

        this.createOverlay();
        this.currentStep = 0;
        this.showStep(this.currentStep);
    }

    /**
     * Create overlay
     */
    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'onboarding-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 9998;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        document.body.appendChild(this.overlay);
    }

    /**
     * Show specific step
     * @param {number} stepIndex - Step index to show
     */
    showStep(stepIndex) {
        if (stepIndex < 0 || stepIndex >= this.steps.length) {
            this.complete();
            return;
        }

        const step = this.steps[stepIndex];

        // Remove previous tooltip
        if (this.tooltip) {
            this.tooltip.remove();
        }

        // Highlight element if specified
        if (step.element) {
            const element = document.querySelector(step.element);
            if (element) {
                this.highlightElement(element);
                this.createTooltip(step, element);
            } else {
                // Element not found, show centered tooltip
                this.createCenteredTooltip(step);
            }
        } else {
            this.createCenteredTooltip(step);
        }

        // Execute step action if any
        if (step.action) {
            step.action();
        }
    }

    /**
     * Highlight element
     * @param {HTMLElement} element - Element to highlight
     */
    highlightElement(element) {
        // Remove previous highlights
        document.querySelectorAll('.onboarding-highlight').forEach(el => {
            el.classList.remove('onboarding-highlight');
        });

        element.classList.add('onboarding-highlight');
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Add CSS for highlight
        if (!document.getElementById('onboarding-styles')) {
            const style = document.createElement('style');
            style.id = 'onboarding-styles';
            style.textContent = `
                .onboarding-highlight {
                    position: relative;
                    z-index: 9999;
                    box-shadow: 0 0 0 4px rgba(74, 144, 226, 0.8),
                                0 0 0 9999px rgba(0, 0, 0, 0.7);
                    border-radius: 8px;
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Create tooltip near element
     * @param {Object} step - Step configuration
     * @param {HTMLElement} element - Target element
     */
    createTooltip(step, element) {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'onboarding-tooltip';
        this.tooltip.style.cssText = `
            position: absolute;
            background: white;
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
            max-width: 400px;
            z-index: 10000;
        `;

        this.tooltip.innerHTML = `
            <h3 style="margin: 0 0 12px 0; font-size: 1.25rem; color: #333;">
                ${step.title}
            </h3>
            <p style="margin: 0 0 20px 0; color: #666; line-height: 1.6;">
                ${step.content}
            </p>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #999; font-size: 0.875rem;">
                    Step ${this.currentStep + 1} of ${this.steps.length}
                </span>
                <div style="display: flex; gap: 10px;">
                    ${this.currentStep > 0 ? `
                        <button onclick="onboarding.previousStep()" style="
                            padding: 8px 16px;
                            border: 1px solid #ddd;
                            background: white;
                            border-radius: 6px;
                            cursor: pointer;
                        ">
                            Previous
                        </button>
                    ` : ''}
                    <button onclick="onboarding.${this.currentStep === this.steps.length - 1 ? 'complete' : 'nextStep'}()" style="
                        padding: 8px 16px;
                        border: none;
                        background: #4A90E2;
                        color: white;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 600;
                    ">
                        ${this.currentStep === this.steps.length - 1 ? 'Get Started' : 'Next'}
                    </button>
                </div>
            </div>
            <button onclick="onboarding.skip()" style="
                position: absolute;
                top: 12px;
                right: 12px;
                background: none;
                border: none;
                font-size: 1.5rem;
                color: #999;
                cursor: pointer;
            ">&times;</button>
        `;

        document.body.appendChild(this.tooltip);

        // Position tooltip relative to element
        this.positionTooltip(element, step.position);
    }

    /**
     * Create centered tooltip
     * @param {Object} step - Step configuration
     */
    createCenteredTooltip(step) {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'onboarding-tooltip';
        this.tooltip.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            z-index: 10000;
            text-align: center;
        `;

        this.tooltip.innerHTML = `
            <h3 style="margin: 0 0 16px 0; font-size: 1.75rem; color: #333;">
                ${step.title}
            </h3>
            <p style="margin: 0 0 30px 0; color: #666; line-height: 1.8; font-size: 1.1rem;">
                ${step.content}
            </p>
            <div style="display: flex; justify-content: center; align-items: center; gap: 15px;">
                <span style="color: #999; font-size: 0.9rem;">
                    ${this.currentStep + 1} of ${this.steps.length}
                </span>
                <div style="display: flex; gap: 10px;">
                    ${this.currentStep > 0 ? `
                        <button onclick="onboarding.previousStep()" style="
                            padding: 12px 24px;
                            border: 1px solid #ddd;
                            background: white;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                        ">
                            Previous
                        </button>
                    ` : ''}
                    <button onclick="onboarding.${this.currentStep === this.steps.length - 1 ? 'complete' : 'nextStep'}()" style="
                        padding: 12px 24px;
                        border: none;
                        background: #4A90E2;
                        color: white;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 1rem;
                    ">
                        ${this.currentStep === this.steps.length - 1 ? 'Get Started 🚀' : 'Next →'}
                    </button>
                </div>
            </div>
            <button onclick="onboarding.skip()" style="
                position: absolute;
                top: 16px;
                right: 16px;
                background: none;
                border: none;
                font-size: 1.75rem;
                color: #999;
                cursor: pointer;
            ">&times;</button>
        `;

        document.body.appendChild(this.tooltip);
    }

    /**
     * Position tooltip relative to element
     * @param {HTMLElement} element - Target element
     * @param {string} position - Position (top, bottom, left, right)
     */
    positionTooltip(element, position) {
        const rect = element.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();

        let top, left;

        switch (position) {
            case 'top':
                top = rect.top - tooltipRect.height - 20;
                left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'bottom':
                top = rect.bottom + 20;
                left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'left':
                top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
                left = rect.left - tooltipRect.width - 20;
                break;
            case 'right':
                top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
                left = rect.right + 20;
                break;
            default:
                // Center
                top = window.innerHeight / 2 - tooltipRect.height / 2;
                left = window.innerWidth / 2 - tooltipRect.width / 2;
        }

        this.tooltip.style.top = `${Math.max(20, top)}px`;
        this.tooltip.style.left = `${Math.max(20, Math.min(window.innerWidth - tooltipRect.width - 20, left))}px`;
    }

    /**
     * Go to next step
     */
    nextStep() {
        this.currentStep++;
        this.showStep(this.currentStep);
    }

    /**
     * Go to previous step
     */
    previousStep() {
        this.currentStep--;
        this.showStep(this.currentStep);
    }

    /**
     * Skip onboarding
     */
    skip() {
        if (confirm('Are you sure you want to skip the tour? You can always restart it from the help menu.')) {
            this.complete();
        }
    }

    /**
     * Complete onboarding
     */
    complete() {
        // Clean up
        if (this.overlay) {
            this.overlay.remove();
        }

        if (this.tooltip) {
            this.tooltip.remove();
        }

        document.querySelectorAll('.onboarding-highlight').forEach(el => {
            el.classList.remove('onboarding-highlight');
        });

        // Mark as completed
        localStorage.setItem('onboarding_completed', 'true');
        this.completed = true;

        // Show completion message
        alert('Welcome to Koby! You\'re all set to start exploring your reading journey.');
    }

    /**
     * Reset onboarding
     */
    reset() {
        localStorage.removeItem('onboarding_completed');
        this.completed = false;
        this.currentStep = 0;
    }

    /**
     * Restart onboarding
     */
    restart() {
        this.reset();
        this.start();
    }
}

// Create global instance
window.onboarding = new OnboardingManager();

// Export for module usage
export default window.onboarding;
