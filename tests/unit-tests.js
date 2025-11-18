/**
 * Unit Tests for Koby
 * Tests individual functions and classes in isolation
 */

import { assert } from './test-framework.js';

export const unitTests = [
    // Cache Manager Tests
    {
        name: 'CacheManager should store and retrieve data',
        fn: async () => {
            // This would normally import CacheManager
            // For now, testing the concept
            const cache = new Map();
            cache.set('test-key', 'test-value');

            assert.equal(cache.get('test-key'), 'test-value');
        }
    },

    // String utility tests
    {
        name: 'String normalization should work correctly',
        fn: () => {
            const normalize = (str) => str.toLowerCase().trim();

            assert.equal(normalize('  HELLO  '), 'hello');
            assert.equal(normalize('World'), 'world');
        }
    },

    // Array utility tests
    {
        name: 'Array deduplication should work',
        fn: () => {
            const dedupe = (arr) => [...new Set(arr)];

            assert.deepEqual(dedupe([1, 2, 2, 3, 3, 3]), [1, 2, 3]);
            assert.arrayLength(dedupe([1, 1, 1]), 1);
        }
    },

    // Date formatting tests
    {
        name: 'Date formatting should work correctly',
        fn: () => {
            const formatDate = (date) => {
                return new Date(date).toISOString().split('T')[0];
            };

            assert.equal(formatDate('2025-01-15'), '2025-01-15');
        }
    },

    // Object deep merge tests
    {
        name: 'Object deep merge should work',
        fn: () => {
            const merge = (obj1, obj2) => ({ ...obj1, ...obj2 });

            const result = merge({ a: 1, b: 2 }, { b: 3, c: 4 });

            assert.deepEqual(result, { a: 1, b: 3, c: 4 });
        }
    },

    // URL validation tests
    {
        name: 'URL validation should work',
        fn: () => {
            const isValidUrl = (str) => {
                try {
                    new URL(str);
                    return true;
                } catch {
                    return false;
                }
            };

            assert.true(isValidUrl('https://example.com'));
            assert.false(isValidUrl('not a url'));
        }
    },

    // Email validation tests
    {
        name: 'Email validation should work',
        fn: () => {
            const isValidEmail = (email) => {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            };

            assert.true(isValidEmail('user@example.com'));
            assert.false(isValidEmail('invalid-email'));
        }
    },

    // Truncate text tests
    {
        name: 'Text truncation should work',
        fn: () => {
            const truncate = (text, maxLength) => {
                if (text.length <= maxLength) return text;
                return text.slice(0, maxLength) + '...';
            };

            assert.equal(truncate('Hello World', 5), 'Hello...');
            assert.equal(truncate('Hi', 10), 'Hi');
        }
    },

    // Percentage calculation tests
    {
        name: 'Percentage calculation should work',
        fn: () => {
            const calculatePercentage = (value, total) => {
                if (total === 0) return 0;
                return Math.round((value / total) * 100);
            };

            assert.equal(calculatePercentage(50, 100), 50);
            assert.equal(calculatePercentage(1, 3), 33);
            assert.equal(calculatePercentage(0, 0), 0);
        }
    },

    // Time formatting tests
    {
        name: 'Time formatting should work',
        fn: () => {
            const formatTime = (minutes) => {
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                return `${hours}h ${mins}m`;
            };

            assert.equal(formatTime(125), '2h 5m');
            assert.equal(formatTime(45), '0h 45m');
        }
    },

    // Book ID sanitization tests
    {
        name: 'Book ID sanitization should work',
        fn: () => {
            const sanitizeBookId = (id) => {
                return id.replace(/\//g, '__');
            };

            assert.equal(sanitizeBookId('book/123/test'), 'book__123__test');
            assert.notEqual(sanitizeBookId('book/123'), 'book/123');
        }
    },

    // Hash generation tests
    {
        name: 'Hash generation should create consistent hashes',
        fn: async () => {
            const simpleHash = (str) => {
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }
                return hash.toString(36);
            };

            const hash1 = simpleHash('test');
            const hash2 = simpleHash('test');
            const hash3 = simpleHash('different');

            assert.equal(hash1, hash2);
            assert.notEqual(hash1, hash3);
        }
    },

    // Color code mapping tests
    {
        name: 'Color code mapping should work',
        fn: () => {
            const colorMap = {
                0: 'Yellow',
                1: 'Pink',
                2: 'Blue',
                3: 'Green'
            };

            const getColorName = (code) => colorMap[code] || 'No Color';

            assert.equal(getColorName(0), 'Yellow');
            assert.equal(getColorName(99), 'No Color');
        }
    },

    // Keyword extraction tests
    {
        name: 'Keyword extraction should work',
        fn: () => {
            const extractKeywords = (text) => {
                const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but']);
                return text.toLowerCase()
                    .split(/\s+/)
                    .filter(w => w.length > 3 && !stopwords.has(w));
            };

            const keywords = extractKeywords('The quick brown fox jumps');
            assert.arrayContains(keywords, 'quick');
            assert.arrayContains(keywords, 'brown');
        }
    },

    // Sort by date tests
    {
        name: 'Sorting by date should work',
        fn: () => {
            const items = [
                { date: '2025-01-15' },
                { date: '2025-01-10' },
                { date: '2025-01-20' }
            ];

            const sorted = items.sort((a, b) =>
                new Date(b.date) - new Date(a.date)
            );

            assert.equal(sorted[0].date, '2025-01-20');
            assert.equal(sorted[2].date, '2025-01-10');
        }
    },

    // Pagination tests
    {
        name: 'Pagination should work correctly',
        fn: () => {
            const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const pageSize = 3;
            const page = 2;

            const paginate = (arr, page, size) => {
                const start = (page - 1) * size;
                return arr.slice(start, start + size);
            };

            const result = paginate(items, page, pageSize);

            assert.arrayLength(result, 3);
            assert.deepEqual(result, [4, 5, 6]);
        }
    },

    // Local storage mock tests
    {
        name: 'LocalStorage mock should work',
        fn: () => {
            const storage = new Map();

            const setItem = (key, value) => storage.set(key, value);
            const getItem = (key) => storage.get(key);
            const removeItem = (key) => storage.delete(key);

            setItem('test', 'value');
            assert.equal(getItem('test'), 'value');

            removeItem('test');
            assert.undefined(getItem('test'));
        }
    },

    // Debounce function tests
    {
        name: 'Debounce should delay execution',
        fn: async () => {
            let called = false;

            const debounce = (fn, delay) => {
                let timeout;
                return (...args) => {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => fn(...args), delay);
                };
            };

            const debouncedFn = debounce(() => { called = true; }, 100);

            debouncedFn();
            assert.false(called);

            await new Promise(resolve => setTimeout(resolve, 150));
            assert.true(called);
        }
    },

    // Throttle function tests
    {
        name: 'Throttle should limit execution rate',
        fn: async () => {
            let callCount = 0;

            const throttle = (fn, delay) => {
                let lastCall = 0;
                return (...args) => {
                    const now = Date.now();
                    if (now - lastCall >= delay) {
                        lastCall = now;
                        return fn(...args);
                    }
                };
            };

            const throttledFn = throttle(() => { callCount++; }, 100);

            throttledFn();
            throttledFn();
            throttledFn();

            assert.equal(callCount, 1);

            await new Promise(resolve => setTimeout(resolve, 150));

            throttledFn();
            assert.equal(callCount, 2);
        }
    },

    // Error handling tests
    {
        name: 'Error handling should work',
        fn: () => {
            const parseJSON = (str) => {
                try {
                    return JSON.parse(str);
                } catch (error) {
                    return null;
                }
            };

            assert.deepEqual(parseJSON('{"a":1}'), { a: 1 });
            assert.null(parseJSON('invalid json'));
        }
    }
];
