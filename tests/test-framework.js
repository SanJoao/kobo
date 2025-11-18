/**
 * Lightweight Test Framework for Koby
 * Supports unit tests, integration tests, and basic assertions
 */

export class TestRunner {
    constructor() {
        this.suites = new Map();
        this.results = new Map();
    }

    /**
     * Register a test suite
     */
    registerSuite(name, tests) {
        this.suites.set(name, tests);
        this.results.set(name, []);
    }

    /**
     * Run all test suites
     */
    async runAll() {
        for (const [suiteName, tests] of this.suites.entries()) {
            await this.runSuite(suiteName);
        }
    }

    /**
     * Run a specific test suite
     */
    async runSuite(suiteName) {
        const tests = this.suites.get(suiteName);
        if (!tests) {
            console.error(`Test suite "${suiteName}" not found`);
            return;
        }

        const results = [];

        for (const test of tests) {
            const result = await this.runTest(test);
            results.push(result);
        }

        this.results.set(suiteName, results);
    }

    /**
     * Run a single test
     */
    async runTest(test) {
        const startTime = performance.now();

        try {
            await test.fn();

            return {
                name: test.name,
                status: 'passed',
                duration: Math.round(performance.now() - startTime),
                error: null
            };
        } catch (error) {
            return {
                name: test.name,
                status: 'failed',
                duration: Math.round(performance.now() - startTime),
                error: error.message
            };
        }
    }

    /**
     * Get test results
     */
    getResults() {
        let total = 0;
        let passed = 0;
        let failed = 0;
        let skipped = 0;

        const suites = {};

        for (const [suiteName, results] of this.results.entries()) {
            suites[suiteName] = results;

            results.forEach(result => {
                total++;
                if (result.status === 'passed') passed++;
                else if (result.status === 'failed') failed++;
                else if (result.status === 'skipped') skipped++;
            });
        }

        return {
            total,
            passed,
            failed,
            skipped,
            suites
        };
    }

    /**
     * Clear all results
     */
    clear() {
        for (const suiteName of this.results.keys()) {
            this.results.set(suiteName, []);
        }
    }
}

/**
 * Assertion helpers
 */
export const assert = {
    equal(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(message || `Expected ${expected}, but got ${actual}`);
        }
    },

    notEqual(actual, expected, message) {
        if (actual === expected) {
            throw new Error(message || `Expected values to be different`);
        }
    },

    deepEqual(actual, expected, message) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(message || `Objects are not equal`);
        }
    },

    true(value, message) {
        if (value !== true) {
            throw new Error(message || `Expected true, but got ${value}`);
        }
    },

    false(value, message) {
        if (value !== false) {
            throw new Error(message || `Expected false, but got ${value}`);
        }
    },

    truthy(value, message) {
        if (!value) {
            throw new Error(message || `Expected truthy value, but got ${value}`);
        }
    },

    falsy(value, message) {
        if (value) {
            throw new Error(message || `Expected falsy value, but got ${value}`);
        }
    },

    throws(fn, message) {
        try {
            fn();
            throw new Error(message || 'Expected function to throw an error');
        } catch (error) {
            // Expected
        }
    },

    async throwsAsync(fn, message) {
        try {
            await fn();
            throw new Error(message || 'Expected async function to throw an error');
        } catch (error) {
            // Expected
        }
    },

    arrayContains(array, item, message) {
        if (!array.includes(item)) {
            throw new Error(message || `Expected array to contain ${item}`);
        }
    },

    arrayLength(array, length, message) {
        if (array.length !== length) {
            throw new Error(message || `Expected array length ${length}, but got ${array.length}`);
        }
    },

    exists(value, message) {
        if (value === null || value === undefined) {
            throw new Error(message || 'Expected value to exist');
        }
    },

    null(value, message) {
        if (value !== null) {
            throw new Error(message || `Expected null, but got ${value}`);
        }
    },

    undefined(value, message) {
        if (value !== undefined) {
            throw new Error(message || `Expected undefined, but got ${value}`);
        }
    },

    instanceOf(value, constructor, message) {
        if (!(value instanceof constructor)) {
            throw new Error(message || `Expected instance of ${constructor.name}`);
        }
    },

    typeof(value, type, message) {
        if (typeof value !== type) {
            throw new Error(message || `Expected type ${type}, but got ${typeof value}`);
        }
    }
};

/**
 * Mock helper
 */
export class Mock {
    constructor(implementation = () => {}) {
        this.implementation = implementation;
        this.calls = [];
    }

    mock(newImplementation) {
        this.implementation = newImplementation;
        return this;
    }

    mockReturnValue(value) {
        this.implementation = () => value;
        return this;
    }

    mockReturnValueOnce(value) {
        const originalImpl = this.implementation;
        let called = false;

        this.implementation = function(...args) {
            if (!called) {
                called = true;
                return value;
            }
            return originalImpl.apply(this, args);
        };

        return this;
    }

    mockResolvedValue(value) {
        this.implementation = async () => value;
        return this;
    }

    mockRejectedValue(error) {
        this.implementation = async () => {
            throw error;
        };
        return this;
    }

    async call(...args) {
        this.calls.push(args);
        return await this.implementation(...args);
    }

    called() {
        return this.calls.length > 0;
    }

    calledWith(...args) {
        return this.calls.some(call =>
            JSON.stringify(call) === JSON.stringify(args)
        );
    }

    calledTimes(count) {
        return this.calls.length === count;
    }

    reset() {
        this.calls = [];
    }
}

/**
 * Test utilities
 */
export const testUtils = {
    /**
     * Wait for a condition to be true
     */
    async waitFor(condition, timeout = 5000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            if (await condition()) {
                return;
            }
            await this.sleep(100);
        }

        throw new Error('Timeout waiting for condition');
    },

    /**
     * Sleep for milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Create a spy function
     */
    spy(fn = () => {}) {
        const mock = new Mock(fn);
        return (...args) => mock.call(...args);
    }
};
