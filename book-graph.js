/**
 * Book Connection Graph
 * Visualizes relationships between books using D3.js force-directed graph
 * Shows connections based on: shared authors, series, genres, themes in highlights
 */

import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { db } from './firebase-init.js';

export class BookConnectionAnalyzer {
    constructor(userId) {
        this.userId = userId;
        this.books = [];
        this.highlights = [];
        this.connections = [];
        this.nodes = [];
        this.links = [];
    }

    /**
     * Analyze books and highlights to find connections
     */
    async analyze() {
        // Fetch books and highlights
        await this.fetchData();

        // Find connections between books
        this.findConnections();

        // Build graph data
        this.buildGraphData();

        return {
            nodes: this.nodes,
            links: this.links
        };
    }

    /**
     * Fetch books and highlights from Firestore
     */
    async fetchData() {
        const [booksSnapshot, highlightsSnapshot] = await Promise.all([
            getDocs(collection(db, 'users', this.userId, 'books')),
            getDocs(collection(db, 'users', this.userId, 'highlights'))
        ]);

        this.books = booksSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        this.highlights = highlightsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    }

    /**
     * Find connections between books
     */
    findConnections() {
        this.connections = [];

        for (let i = 0; i < this.books.length; i++) {
            for (let j = i + 1; j < this.books.length; j++) {
                const book1 = this.books[i];
                const book2 = this.books[j];

                const connection = this.calculateConnection(book1, book2);

                if (connection.strength > 0.1) {
                    this.connections.push({
                        source: book1.id,
                        target: book2.id,
                        strength: connection.strength,
                        reasons: connection.reasons
                    });
                }
            }
        }
    }

    /**
     * Calculate connection strength between two books
     */
    calculateConnection(book1, book2) {
        let strength = 0;
        const reasons = [];

        // Same author (strong connection)
        if (book1.title && book2.title) {
            const author1 = this.extractAuthor(book1.title);
            const author2 = this.extractAuthor(book2.title);

            if (author1 && author2 && author1 === author2) {
                strength += 0.5;
                reasons.push(`Same author: ${author1}`);
            }
        }

        // Same series (very strong connection)
        if (book1.series && book2.series && book1.series === book2.series) {
            strength += 0.7;
            reasons.push(`Same series: ${book1.series}`);
        }

        // Similar reading time (weak connection)
        if (book1.time_spent_reading && book2.time_spent_reading) {
            const ratio = Math.min(book1.time_spent_reading, book2.time_spent_reading) /
                         Math.max(book1.time_spent_reading, book2.time_spent_reading);

            if (ratio > 0.8) {
                strength += 0.1;
                reasons.push('Similar reading time');
            }
        }

        // Shared keywords in highlights
        const sharedKeywords = this.findSharedKeywords(book1.id, book2.id);
        if (sharedKeywords.length > 0) {
            strength += Math.min(sharedKeywords.length * 0.05, 0.4);
            reasons.push(`Shared themes: ${sharedKeywords.slice(0, 3).join(', ')}`);
        }

        // Read around the same time (weak connection)
        if (book1.date_last_read && book2.date_last_read) {
            const daysDiff = Math.abs(
                new Date(book1.date_last_read) - new Date(book2.date_last_read)
            ) / (1000 * 60 * 60 * 24);

            if (daysDiff < 30) {
                strength += 0.15;
                reasons.push('Read around the same time');
            }
        }

        return {
            strength: Math.min(strength, 1),
            reasons
        };
    }

    /**
     * Extract author from book title (simple heuristic)
     */
    extractAuthor(title) {
        // Try to extract author from title like "Title - Author" or "Title by Author"
        const patterns = [
            / - ([^-]+)$/,
            / by ([^,]+)/i,
        ];

        for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }

        return null;
    }

    /**
     * Find shared keywords in highlights
     */
    findSharedKeywords(bookId1, bookId2) {
        const highlights1 = this.highlights.filter(h => h.book_id === bookId1);
        const highlights2 = this.highlights.filter(h => h.book_id === bookId2);

        const keywords1 = this.extractKeywords(highlights1);
        const keywords2 = this.extractKeywords(highlights2);

        // Find intersection
        return keywords1.filter(k => keywords2.includes(k));
    }

    /**
     * Extract keywords from highlights
     */
    extractKeywords(highlights) {
        const stopwords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
            'for', 'of', 'with', 'is', 'was', 'are', 'were', 'been', 'be',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
            'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
        ]);

        const wordCounts = new Map();

        highlights.forEach(h => {
            if (!h.text) return;

            const words = h.text.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .split(/\s+/)
                .filter(w => w.length > 4 && !stopwords.has(w));

            words.forEach(word => {
                wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
            });
        });

        // Return top keywords
        return Array.from(wordCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);
    }

    /**
     * Build graph data structure for D3
     */
    buildGraphData() {
        // Create nodes
        this.nodes = this.books.map(book => ({
            id: book.id,
            title: book.title,
            timeSpent: book.time_spent_reading || 0,
            highlightCount: this.highlights.filter(h => h.book_id === book.id).length,
            percentRead: book.percent_read || 0
        }));

        // Create links
        this.links = this.connections.map(conn => ({
            source: conn.source,
            target: conn.target,
            value: conn.strength,
            reasons: conn.reasons
        }));
    }
}

/**
 * Book Graph Visualizer using D3.js
 */
export class BookGraphVisualizer {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.options = {
            width: 1000,
            height: 800,
            nodeRadius: { min: 10, max: 40 },
            linkStrokeWidth: { min: 1, max: 8 },
            colors: {
                node: '#4A90E2',
                nodeHover: '#E94B4B',
                link: '#999',
                text: '#333'
            },
            ...options
        };

        this.svg = null;
        this.simulation = null;
        this.nodes = [];
        this.links = [];
    }

    /**
     * Render the graph
     */
    render(graphData) {
        this.nodes = graphData.nodes;
        this.links = graphData.links;

        // Clear existing SVG
        const container = document.getElementById(this.containerId);
        container.innerHTML = '';

        // Create SVG
        this.svg = d3.select(`#${this.containerId}`)
            .append('svg')
            .attr('width', this.options.width)
            .attr('height', this.options.height)
            .attr('viewBox', [0, 0, this.options.width, this.options.height]);

        // Add zoom behavior
        const g = this.svg.append('g');

        this.svg.call(d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            }));

        // Create arrow markers for directed edges
        this.svg.append('defs').append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '-0 -5 10 10')
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .append('path')
            .attr('d', 'M 0,-5 L 10,0 L 0,5')
            .attr('fill', this.options.colors.link);

        // Create links
        const link = g.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(this.links)
            .enter().append('line')
            .attr('stroke', this.options.colors.link)
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', d => this.calculateLinkWidth(d.value));

        // Create nodes
        const node = g.append('g')
            .attr('class', 'nodes')
            .selectAll('g')
            .data(this.nodes)
            .enter().append('g')
            .call(d3.drag()
                .on('start', (event, d) => this.dragStarted(event, d))
                .on('drag', (event, d) => this.dragged(event, d))
                .on('end', (event, d) => this.dragEnded(event, d)));

        // Add circles to nodes
        node.append('circle')
            .attr('r', d => this.calculateNodeRadius(d))
            .attr('fill', this.options.colors.node)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .on('mouseover', (event, d) => this.handleNodeHover(event, d, true))
            .on('mouseout', (event, d) => this.handleNodeHover(event, d, false))
            .on('click', (event, d) => this.handleNodeClick(event, d));

        // Add labels to nodes
        node.append('text')
            .attr('dx', 12)
            .attr('dy', '.35em')
            .text(d => this.truncateTitle(d.title, 30))
            .attr('font-size', '12px')
            .attr('fill', this.options.colors.text);

        // Create force simulation
        this.simulation = d3.forceSimulation(this.nodes)
            .force('link', d3.forceLink(this.links)
                .id(d => d.id)
                .distance(100)
                .strength(d => d.value))
            .force('charge', d3.forceManyBody().strength(-400))
            .force('center', d3.forceCenter(this.options.width / 2, this.options.height / 2))
            .force('collision', d3.forceCollide().radius(d => this.calculateNodeRadius(d) + 10));

        // Update positions on tick
        this.simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node
                .attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // Store references for later use
        this.linkSelection = link;
        this.nodeSelection = node;

        // Add legend
        this.addLegend(g);
    }

    /**
     * Calculate node radius based on importance
     */
    calculateNodeRadius(node) {
        const { min, max } = this.options.nodeRadius;

        // Size based on number of highlights
        const normalizedSize = node.highlightCount / Math.max(...this.nodes.map(n => n.highlightCount || 1));

        return min + (max - min) * normalizedSize;
    }

    /**
     * Calculate link width based on strength
     */
    calculateLinkWidth(strength) {
        const { min, max } = this.options.linkStrokeWidth;
        return min + (max - min) * strength;
    }

    /**
     * Truncate title
     */
    truncateTitle(title, maxLength) {
        if (!title) return 'Unknown';
        return title.length > maxLength ? title.slice(0, maxLength) + '...' : title;
    }

    /**
     * Handle node hover
     */
    handleNodeHover(event, node, isHovering) {
        d3.select(event.currentTarget)
            .transition()
            .duration(200)
            .attr('fill', isHovering ? this.options.colors.nodeHover : this.options.colors.node)
            .attr('r', this.calculateNodeRadius(node) * (isHovering ? 1.2 : 1));

        if (isHovering) {
            this.showTooltip(event, node);
        } else {
            this.hideTooltip();
        }

        // Highlight connected nodes and links
        this.highlightConnections(node, isHovering);
    }

    /**
     * Highlight connections
     */
    highlightConnections(node, highlight) {
        // Find connected nodes
        const connectedNodeIds = new Set();
        this.links.forEach(link => {
            if (link.source.id === node.id) connectedNodeIds.add(link.target.id);
            if (link.target.id === node.id) connectedNodeIds.add(link.source.id);
        });

        // Update node opacity
        this.nodeSelection.select('circle')
            .transition()
            .duration(200)
            .attr('opacity', d => {
                if (!highlight) return 1;
                return d.id === node.id || connectedNodeIds.has(d.id) ? 1 : 0.2;
            });

        // Update link opacity
        this.linkSelection
            .transition()
            .duration(200)
            .attr('opacity', d => {
                if (!highlight) return 0.6;
                return d.source.id === node.id || d.target.id === node.id ? 1 : 0.1;
            });
    }

    /**
     * Show tooltip
     */
    showTooltip(event, node) {
        const tooltip = d3.select('body')
            .append('div')
            .attr('class', 'book-graph-tooltip')
            .style('position', 'absolute')
            .style('background', 'rgba(0, 0, 0, 0.8)')
            .style('color', 'white')
            .style('padding', '10px')
            .style('border-radius', '5px')
            .style('font-size', '14px')
            .style('pointer-events', 'none')
            .style('z-index', '1000');

        tooltip.html(`
            <strong>${node.title}</strong><br>
            Highlights: ${node.highlightCount}<br>
            Time spent: ${Math.round(node.timeSpent / 60)}h<br>
            Progress: ${Math.round(node.percentRead * 100)}%
        `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px');
    }

    /**
     * Hide tooltip
     */
    hideTooltip() {
        d3.selectAll('.book-graph-tooltip').remove();
    }

    /**
     * Handle node click
     */
    handleNodeClick(event, node) {
        console.log('Book clicked:', node);

        // Emit custom event
        const customEvent = new CustomEvent('bookNodeClick', {
            detail: { book: node }
        });
        document.dispatchEvent(customEvent);
    }

    /**
     * Drag handlers
     */
    dragStarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    dragEnded(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    /**
     * Add legend
     */
    addLegend(g) {
        const legend = g.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(20, ${this.options.height - 100})`);

        // Node size legend
        legend.append('text')
            .attr('x', 0)
            .attr('y', 0)
            .text('Node size = Number of highlights')
            .attr('font-size', '12px')
            .attr('fill', this.options.colors.text);

        // Link width legend
        legend.append('text')
            .attr('x', 0)
            .attr('y', 20)
            .text('Link width = Connection strength')
            .attr('font-size', '12px')
            .attr('fill', this.options.colors.text);
    }

    /**
     * Destroy the graph
     */
    destroy() {
        if (this.simulation) {
            this.simulation.stop();
        }

        const container = document.getElementById(this.containerId);
        if (container) {
            container.innerHTML = '';
        }
    }
}
