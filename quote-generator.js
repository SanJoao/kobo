/**
 * Quote Image Generator for Koby
 * Generate beautiful, shareable images of highlights using Canvas API
 */

export class QuoteImageGenerator {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.defaultWidth = 1200;
        this.defaultHeight = 630; // Twitter/Facebook optimal size
        this.styles = {
            minimalist: {
                name: 'Minimalist',
                bgColor: '#ffffff',
                textColor: '#333333',
                accentColor: '#4CAF50',
                font: 'Georgia, serif',
                padding: 80
            },
            gradient: {
                name: 'Gradient',
                bgGradient: ['#667eea', '#764ba2'],
                textColor: '#ffffff',
                accentColor: '#f6f9fc',
                font: 'Arial, sans-serif',
                padding: 80
            },
            dark: {
                name: 'Dark Mode',
                bgColor: '#1e1e1e',
                textColor: '#e0e0e0',
                accentColor: '#4CAF50',
                font: 'Georgia, serif',
                padding: 80
            },
            warm: {
                name: 'Warm',
                bgGradient: ['#f5a623', '#f76b1c'],
                textColor: '#ffffff',
                accentColor: '#ffeaa7',
                font: 'Georgia, serif',
                padding: 80
            }
        };
    }

    /**
     * Generate quote image
     */
    async generate(highlight, style = 'minimalist', options = {}) {
        const {
            includeAuthor = true,
            includeBook = true,
            includeLogo = true,
            customText = null
        } = options;

        // Get style configuration
        const styleConfig = this.styles[style] || this.styles.minimalist;

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.defaultWidth;
        this.canvas.height = this.defaultHeight;
        this.ctx = this.canvas.getContext('2d');

        // Draw background
        this.drawBackground(styleConfig);

        // Draw quote text
        const quoteText = customText || highlight.text;
        const quoteY = this.drawQuote(quoteText, styleConfig);

        // Draw attribution
        if (includeBook || includeAuthor) {
            this.drawAttribution(highlight, styleConfig, quoteY, includeBook, includeAuthor);
        }

        // Draw logo/branding
        if (includeLogo) {
            this.drawLogo(styleConfig);
        }

        // Convert to blob
        return new Promise((resolve) => {
            this.canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        });
    }

    /**
     * Draw background
     */
    drawBackground(styleConfig) {
        if (styleConfig.bgGradient) {
            // Gradient background
            const gradient = this.ctx.createLinearGradient(
                0, 0,
                this.canvas.width, this.canvas.height
            );
            gradient.addColorStop(0, styleConfig.bgGradient[0]);
            gradient.addColorStop(1, styleConfig.bgGradient[1]);
            this.ctx.fillStyle = gradient;
        } else {
            // Solid color background
            this.ctx.fillStyle = styleConfig.bgColor;
        }

        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Draw quote text with word wrapping
     */
    drawQuote(text, styleConfig) {
        const maxWidth = this.canvas.width - (styleConfig.padding * 2);
        const lineHeight = 70;
        const fontSize = 48;

        this.ctx.font = `${fontSize}px ${styleConfig.font}`;
        this.ctx.fillStyle = styleConfig.textColor;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';

        // Add opening quote mark
        const quoteMark = '"';
        const fullText = quoteMark + text + quoteMark;

        // Word wrap
        const words = fullText.split(' ');
        const lines = [];
        let currentLine = '';

        words.forEach(word => {
            const testLine = currentLine + word + ' ';
            const metrics = this.ctx.measureText(testLine);

            if (metrics.width > maxWidth && currentLine !== '') {
                lines.push(currentLine.trim());
                currentLine = word + ' ';
            } else {
                currentLine = testLine;
            }
        });

        if (currentLine !== '') {
            lines.push(currentLine.trim());
        }

        // Limit to 8 lines (will truncate long quotes)
        const displayLines = lines.slice(0, 8);
        if (lines.length > 8) {
            displayLines[7] = displayLines[7].substring(0, displayLines[7].length - 4) + '..."';
        }

        // Center vertically
        const totalHeight = displayLines.length * lineHeight;
        let y = (this.canvas.height - totalHeight) / 2 - 40; // Offset for attribution

        // Draw each line
        displayLines.forEach(line => {
            this.ctx.fillText(line, this.canvas.width / 2, y);
            y += lineHeight;
        });

        return y + 40; // Return Y position for attribution
    }

    /**
     * Draw attribution (book title and/or author)
     */
    drawAttribution(highlight, styleConfig, y, includeBook, includeAuthor) {
        const fontSize = 28;
        this.ctx.font = `italic ${fontSize}px ${styleConfig.font}`;
        this.ctx.fillStyle = styleConfig.accentColor;
        this.ctx.textAlign = 'center';

        let attribution = '— ';

        if (includeBook && highlight.book_title) {
            attribution += highlight.book_title;
        }

        if (includeAuthor && highlight.author) {
            if (includeBook) {
                attribution += ' by ' + highlight.author;
            } else {
                attribution += highlight.author;
            }
        }

        this.ctx.fillText(attribution, this.canvas.width / 2, y);
    }

    /**
     * Draw Koby logo/branding
     */
    drawLogo(styleConfig) {
        const logoText = 'Koby';
        const fontSize = 24;
        const padding = 30;

        this.ctx.font = `600 ${fontSize}px Arial, sans-serif`;
        this.ctx.fillStyle = styleConfig.accentColor;
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'bottom';

        this.ctx.fillText(
            logoText,
            this.canvas.width - padding,
            this.canvas.height - padding
        );
    }

    /**
     * Generate preview (returns data URL)
     */
    async generatePreview(highlight, style = 'minimalist', options = {}) {
        await this.generate(highlight, style, options);
        return this.canvas.toDataURL('image/png');
    }

    /**
     * Download quote image
     */
    async download(highlight, style = 'minimalist', options = {}) {
        const blob = await this.generate(highlight, style, options);
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `koby-quote-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        window.track?.('download_quote_image', {
            style,
            highlight_id: highlight?.highlight_id,
            book_title: highlight?.book_title
        });
    }

    /**
     * Share quote image using Web Share API
     */
    async share(highlight, style = 'minimalist', options = {}) {
        const blob = await this.generate(highlight, style, options);

        const file = new File([blob], 'quote.png', { type: 'image/png' });

        const shareData = {
            title: 'Quote from ' + (highlight.book_title || 'a book'),
            text: highlight.text.substring(0, 200) + (highlight.text.length > 200 ? '...' : ''),
            files: [file]
        };

        if (navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
                window.track?.('share_quote_image', {
                    style,
                    method: 'web_share',
                    highlight_id: highlight?.highlight_id
                });
                return { success: true };
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Share failed:', error);
                    return { success: false, error: error.message };
                }
                return { success: false, error: 'cancelled' };
            }
        } else {
            // Fallback: download the image
            await this.download(highlight, style, options);
            return { success: true, fallback: true };
        }
    }

    /**
     * Get all available styles
     */
    getAvailableStyles() {
        return Object.keys(this.styles).map(key => ({
            id: key,
            name: this.styles[key].name
        }));
    }
}

// Create global instance
window.quoteGenerator = new QuoteImageGenerator();
