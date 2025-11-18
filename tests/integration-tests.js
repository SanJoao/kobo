/**
 * Integration Tests for Koby
 * Tests interactions between components
 */

import { assert, testUtils } from './test-framework.js';

export const integrationTests = [
    {
        name: 'DOM should be accessible',
        fn: () => {
            assert.exists(document);
            assert.exists(document.body);
        }
    },

    {
        name: 'LocalStorage should be available',
        fn: () => {
            assert.exists(window.localStorage);

            localStorage.setItem('test-key', 'test-value');
            assert.equal(localStorage.getItem('test-key'), 'test-value');
            localStorage.removeItem('test-key');
        }
    },

    {
        name: 'IndexedDB should be available',
        fn: () => {
            assert.exists(window.indexedDB);
        }
    },

    {
        name: 'Fetch API should be available',
        fn: () => {
            assert.exists(window.fetch);
            assert.typeof(fetch, 'function');
        }
    },

    {
        name: 'Performance API should be available',
        fn: () => {
            assert.exists(window.performance);
            assert.typeof(performance.now, 'function');
        }
    },

    {
        name: 'Console methods should be available',
        fn: () => {
            assert.exists(console.log);
            assert.exists(console.error);
            assert.exists(console.warn);
        }
    },

    {
        name: 'Promises should work correctly',
        fn: async () => {
            const result = await Promise.resolve(42);
            assert.equal(result, 42);

            let error = null;
            try {
                await Promise.reject(new Error('Test error'));
            } catch (e) {
                error = e;
            }

            assert.exists(error);
        }
    },

    {
        name: 'Async/await should work correctly',
        fn: async () => {
            const asyncFunction = async () => {
                await testUtils.sleep(10);
                return 'success';
            };

            const result = await asyncFunction();
            assert.equal(result, 'success');
        }
    },

    {
        name: 'Array methods should work',
        fn: () => {
            const arr = [1, 2, 3, 4, 5];

            const mapped = arr.map(x => x * 2);
            assert.deepEqual(mapped, [2, 4, 6, 8, 10]);

            const filtered = arr.filter(x => x > 2);
            assert.deepEqual(filtered, [3, 4, 5]);

            const reduced = arr.reduce((sum, x) => sum + x, 0);
            assert.equal(reduced, 15);
        }
    },

    {
        name: 'Object methods should work',
        fn: () => {
            const obj = { a: 1, b: 2, c: 3 };

            assert.deepEqual(Object.keys(obj), ['a', 'b', 'c']);
            assert.deepEqual(Object.values(obj), [1, 2, 3]);

            const entries = Object.entries(obj);
            assert.arrayLength(entries, 3);
        }
    },

    {
        name: 'Map data structure should work',
        fn: () => {
            const map = new Map();

            map.set('key1', 'value1');
            map.set('key2', 'value2');

            assert.equal(map.get('key1'), 'value1');
            assert.equal(map.size, 2);
            assert.true(map.has('key2'));

            map.delete('key1');
            assert.false(map.has('key1'));
        }
    },

    {
        name: 'Set data structure should work',
        fn: () => {
            const set = new Set([1, 2, 3, 2, 1]);

            assert.equal(set.size, 3);
            assert.true(set.has(1));
            assert.false(set.has(4));

            set.add(4);
            assert.true(set.has(4));
        }
    },

    {
        name: 'URL API should work',
        fn: () => {
            const url = new URL('https://example.com/path?param=value');

            assert.equal(url.hostname, 'example.com');
            assert.equal(url.pathname, '/path');
            assert.equal(url.searchParams.get('param'), 'value');
        }
    },

    {
        name: 'FormData should work',
        fn: () => {
            const formData = new FormData();

            formData.append('field1', 'value1');
            formData.append('field2', 'value2');

            assert.equal(formData.get('field1'), 'value1');
        }
    },

    {
        name: 'Blob API should work',
        fn: () => {
            const blob = new Blob(['Hello World'], { type: 'text/plain' });

            assert.equal(blob.type, 'text/plain');
            assert.equal(blob.size, 11);
        }
    },

    {
        name: 'TextEncoder/TextDecoder should work',
        fn: () => {
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();

            const encoded = encoder.encode('Hello');
            const decoded = decoder.decode(encoded);

            assert.equal(decoded, 'Hello');
        }
    },

    {
        name: 'Intersection Observer should be available',
        fn: () => {
            assert.exists(window.IntersectionObserver);
        }
    },

    {
        name: 'Mutation Observer should be available',
        fn: () => {
            assert.exists(window.MutationObserver);
        }
    },

    {
        name: 'Crypto API should be available',
        fn: () => {
            assert.exists(window.crypto);
            assert.exists(crypto.randomUUID);

            const uuid = crypto.randomUUID();
            assert.typeof(uuid, 'string');
        }
    },

    {
        name: 'Canvas API should work',
        fn: () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            assert.exists(ctx);
            assert.typeof(ctx.fillRect, 'function');
        }
    }
];
