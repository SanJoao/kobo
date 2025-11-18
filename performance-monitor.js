/**
 * Performance Monitor for Koby
 * Tracks custom metrics, traces, and performance data
 * using Firebase Performance Monitoring
 */

import { perf } from './firebase-init.js';
import { trace } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-performance.js";

export class PerformanceMonitor {
    constructor() {
        this.perf = perf;
        this.activeTraces = new Map();
    }

    /**
     * Start a custom trace
     * @param {string} traceName - Name of the trace
     * @returns {object} - Trace object
     */
    startTrace(traceName) {
        try {
            const customTrace = trace(this.perf, traceName);
            customTrace.start();
            this.activeTraces.set(traceName, customTrace);
            return customTrace;
        } catch (error) {
            console.error(`Error starting trace ${traceName}:`, error);
            return null;
        }
    }

    /**
     * Stop a custom trace
     * @param {string} traceName - Name of the trace to stop
     */
    stopTrace(traceName) {
        try {
            const customTrace = this.activeTraces.get(traceName);
            if (customTrace) {
                customTrace.stop();
                this.activeTraces.delete(traceName);
            }
        } catch (error) {
            console.error(`Error stopping trace ${traceName}:`, error);
        }
    }

    /**
     * Add custom metric to a trace
     * @param {string} traceName - Name of the trace
     * @param {string} metricName - Name of the metric
     * @param {number} value - Metric value
     */
    putMetric(traceName, metricName, value) {
        try {
            const customTrace = this.activeTraces.get(traceName);
            if (customTrace) {
                customTrace.putMetric(metricName, value);
            }
        } catch (error) {
            console.error(`Error adding metric ${metricName} to trace ${traceName}:`, error);
        }
    }

    /**
     * Increment a metric in a trace
     * @param {string} traceName - Name of the trace
     * @param {string} metricName - Name of the metric
     */
    incrementMetric(traceName, metricName) {
        try {
            const customTrace = this.activeTraces.get(traceName);
            if (customTrace) {
                customTrace.incrementMetric(metricName, 1);
            }
        } catch (error) {
            console.error(`Error incrementing metric ${metricName} in trace ${traceName}:`, error);
        }
    }

    /**
     * Add custom attribute to a trace
     * @param {string} traceName - Name of the trace
     * @param {string} attributeName - Name of the attribute
     * @param {string} value - Attribute value
     */
    putAttribute(traceName, attributeName, value) {
        try {
            const customTrace = this.activeTraces.get(traceName);
            if (customTrace) {
                customTrace.putAttribute(attributeName, String(value));
            }
        } catch (error) {
            console.error(`Error adding attribute ${attributeName} to trace ${traceName}:`, error);
        }
    }

    /**
     * Track a complete operation with automatic start/stop
     * @param {string} traceName - Name of the trace
     * @param {Function} operation - Async operation to track
     * @param {object} attributes - Optional attributes to add to trace
     * @returns {Promise} - Result of the operation
     */
    async trackOperation(traceName, operation, attributes = {}) {
        const customTrace = this.startTrace(traceName);

        try {
            // Add attributes
            for (const [key, value] of Object.entries(attributes)) {
                this.putAttribute(traceName, key, value);
            }

            // Execute operation
            const startTime = performance.now();
            const result = await operation();
            const duration = performance.now() - startTime;

            // Add duration metric
            this.putMetric(traceName, 'duration_ms', Math.round(duration));

            return result;
        } catch (error) {
            this.putAttribute(traceName, 'error', error.message);
            throw error;
        } finally {
            this.stopTrace(traceName);
        }
    }

    /**
     * Track database operations
     */
    trackDatabaseRead(count) {
        this.putMetric('page_load', 'firestore_reads', count);
    }

    /**
     * Track cache hits/misses
     */
    trackCachePerformance(hit, source) {
        const traceName = 'cache_performance';
        if (!this.activeTraces.has(traceName)) {
            this.startTrace(traceName);
        }

        if (hit) {
            this.incrementMetric(traceName, 'cache_hits');
        } else {
            this.incrementMetric(traceName, 'cache_misses');
        }

        this.putAttribute(traceName, 'cache_source', source);
    }

    /**
     * Track upload performance
     */
    async trackUpload(fileSize, uploadFunction) {
        return await this.trackOperation('file_upload', uploadFunction, {
            file_size_kb: Math.round(fileSize / 1024)
        });
    }

    /**
     * Track export performance
     */
    async trackExport(exportType, itemCount, exportFunction) {
        return await this.trackOperation('export_operation', exportFunction, {
            export_type: exportType,
            item_count: itemCount
        });
    }

    /**
     * Track search performance
     */
    async trackSearch(searchType, searchFunction) {
        return await this.trackOperation('search_operation', searchFunction, {
            search_type: searchType
        });
    }

    /**
     * Track feed load performance
     */
    async trackFeedLoad(itemCount, loadFunction) {
        return await this.trackOperation('feed_load', loadFunction, {
            item_count: itemCount
        });
    }

    /**
     * Track page navigation
     */
    trackPageView(pageName) {
        const traceName = `page_${pageName}`;
        this.startTrace(traceName);

        // Auto-stop after 30 seconds (Firebase limit)
        setTimeout(() => {
            if (this.activeTraces.has(traceName)) {
                this.stopTrace(traceName);
            }
        }, 30000);
    }

    /**
     * Measure Time to Interactive (TTI)
     */
    measureTTI() {
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.name === 'first-input') {
                            this.putMetric('page_load', 'time_to_interactive',
                                Math.round(entry.processingStart));
                        }
                    }
                });
                observer.observe({ entryTypes: ['first-input'] });
            } catch (error) {
                console.error('Error measuring TTI:', error);
            }
        }
    }

    /**
     * Measure Largest Contentful Paint (LCP)
     */
    measureLCP() {
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    const lastEntry = entries[entries.length - 1];
                    this.putMetric('page_load', 'largest_contentful_paint',
                        Math.round(lastEntry.renderTime || lastEntry.loadTime));
                });
                observer.observe({ entryTypes: ['largest-contentful-paint'] });
            } catch (error) {
                console.error('Error measuring LCP:', error);
            }
        }
    }

    /**
     * Measure First Input Delay (FID)
     */
    measureFID() {
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        const delay = entry.processingStart - entry.startTime;
                        this.putMetric('page_load', 'first_input_delay', Math.round(delay));
                    }
                });
                observer.observe({ entryTypes: ['first-input'] });
            } catch (error) {
                console.error('Error measuring FID:', error);
            }
        }
    }

    /**
     * Measure Cumulative Layout Shift (CLS)
     */
    measureCLS() {
        if ('PerformanceObserver' in window) {
            try {
                let clsScore = 0;
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (!entry.hadRecentInput) {
                            clsScore += entry.value;
                            this.putMetric('page_load', 'cumulative_layout_shift',
                                Math.round(clsScore * 1000) / 1000);
                        }
                    }
                });
                observer.observe({ entryTypes: ['layout-shift'] });
            } catch (error) {
                console.error('Error measuring CLS:', error);
            }
        }
    }

    /**
     * Initialize Core Web Vitals monitoring
     */
    initCoreWebVitals() {
        const pageLoadTrace = this.startTrace('page_load');

        this.measureLCP();
        this.measureFID();
        this.measureCLS();
        this.measureTTI();

        // Stop page load trace after page is fully loaded
        window.addEventListener('load', () => {
            setTimeout(() => {
                if (this.activeTraces.has('page_load')) {
                    this.stopTrace('page_load');
                }
            }, 1000);
        });
    }

    /**
     * Track API call performance
     */
    async trackAPICall(endpoint, method, apiFunction) {
        return await this.trackOperation('api_call', apiFunction, {
            endpoint: endpoint,
            method: method
        });
    }

    /**
     * Track rendering performance
     */
    trackRenderTime(componentName, itemCount) {
        const traceName = `render_${componentName}`;
        const trace = this.startTrace(traceName);

        this.putMetric(traceName, 'item_count', itemCount);

        // Return function to stop trace
        return () => this.stopTrace(traceName);
    }

    /**
     * Get memory usage (if available)
     */
    getMemoryUsage() {
        if (performance.memory) {
            return {
                usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1048576), // MB
                totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1048576), // MB
                jsHeapSizeLimit: Math.round(performance.memory.jsHeapSizeLimit / 1048576) // MB
            };
        }
        return null;
    }

    /**
     * Log performance summary to console (development mode)
     */
    logPerformanceSummary() {
        const memory = this.getMemoryUsage();

        console.group('📊 Performance Summary');

        if (memory) {
            console.log(`Memory Usage: ${memory.usedJSHeapSize}MB / ${memory.jsHeapSizeLimit}MB`);
        }

        console.log('Active Traces:', Array.from(this.activeTraces.keys()));

        // Get navigation timing
        if (performance.timing) {
            const timing = performance.timing;
            const loadTime = timing.loadEventEnd - timing.navigationStart;
            const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;

            console.log(`Page Load Time: ${loadTime}ms`);
            console.log(`DOM Ready: ${domReady}ms`);
        }

        console.groupEnd();
    }
}

// Create singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Initialize Core Web Vitals on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        performanceMonitor.initCoreWebVitals();
    });
} else {
    performanceMonitor.initCoreWebVitals();
}
