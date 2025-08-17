document.addEventListener('DOMContentLoaded', () => {
    const highlightsContainer = document.getElementById('highlights-container');
    const bookFilter = document.getElementById('book-filter');
    const typeFilter = document.getElementById('type-filter');
    const colorFilter = document.getElementById('color-filter');
    const sortFilter = document.getElementById('sort-filter');
    const searchInput = document.getElementById('search-input');
    
    let allHighlights = [];
    let allBooks = [];
    let booksChart, colorsChart, timeSpentChart, timelineChart;
    let activeBookFilter = null;
    let activeColorFilter = null;

    const colorMap = {
        0: { name: 'Yellow', bg: 'rgba(255, 235, 59, 0.7)', border: 'rgba(255, 235, 59, 1)' },
        1: { name: 'Pink', bg: 'rgba(233, 30, 99, 0.7)', border: 'rgba(233, 30, 99, 1)' },
        2: { name: 'Blue', bg: 'rgba(33, 150, 243, 0.7)', border: 'rgba(33, 150, 243, 1)' },
        3: { name: 'Green', bg: 'rgba(76, 175, 80, 0.7)', border: 'rgba(76, 175, 80, 1)' },
    };

    Promise.all([
        fetch('books.json').then(response => response.json()),
        fetch('highlights.json').then(response => response.json())
    ]).then(([books, highlights]) => {
        allBooks = books;
        const booksMap = new Map(books.map(book => [book.book_id, book]));
        
        allHighlights = highlights.map(highlight => {
            const book = booksMap.get(highlight.book_id);
            return {
                ...highlight,
                ...book,
                book_title: book.title
            };
        });

        populateBookFilter(allBooks);
        createCharts(allHighlights, allBooks);
        filterAndSort();
    });

    function populateBookFilter(books) {
        books.sort((a, b) => a.title.localeCompare(b.title));
        books.forEach(book => {
            const option = document.createElement('option');
            option.value = book.title;
            option.textContent = book.title;
            bookFilter.appendChild(option);
        });
    }

    function createCharts(highlights, books) {
        const booksCtx = document.getElementById('books-chart').getContext('2d');
        const colorsCtx = document.getElementById('colors-chart').getContext('2d');
        const timeSpentCtx = document.getElementById('time-spent-chart').getContext('2d');
        const timelineCtx = document.getElementById('timeline-chart').getContext('2d');

        // Time Spent Chart
        const bookTime = highlights.reduce((acc, h) => {
            if (!acc[h.book_title]) {
                acc[h.book_title] = h.time_spent_reading || 0;
            }
            return acc;
        }, {});
        const sortedTime = Object.entries(bookTime).sort(([, a], [, b]) => b - a);
        timeSpentChart = new Chart(timeSpentCtx, {
            type: 'bar',
            data: {
                labels: sortedTime.map(([title]) => title),
                datasets: [{
                    label: 'Time Spent (hours)',
                    data: sortedTime.map(([, time]) => (time / 3600).toFixed(2)),
                    backgroundColor: colorMap[2].bg,
                    borderColor: colorMap[2].border,
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Time Spent Reading' }
                }
            }
        });

        // Book Chart
        const bookCounts = highlights.reduce((acc, h) => {
            acc[h.book_title] = (acc[h.book_title] || 0) + 1;
            return acc;
        }, {});
        const sortedBooks = Object.entries(bookCounts).sort(([, a], [, b]) => b - a);
        booksChart = new Chart(booksCtx, {
            type: 'bar',
            data: {
                labels: sortedBooks.map(([title]) => title),
                datasets: [{
                    label: 'Highlights Count',
                    data: sortedBooks.map(([, count]) => count),
                    backgroundColor: colorMap[0].bg,
                    borderColor: colorMap[0].border,
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Highlights by Book' }
                },
                onClick: (evt, elements) => {
                    if (elements.length > 0) {
                        const clickedBook = booksChart.data.labels[elements[0].index];
                        if (activeBookFilter === clickedBook) {
                            bookFilter.value = 'all';
                            activeBookFilter = null;
                        } else {
                            bookFilter.value = clickedBook;
                            activeBookFilter = clickedBook;
                        }
                        filterAndSort();
                    }
                }
            }
        });

        // Color Chart
        const colorCounts = highlights.reduce((acc, h) => {
            acc[h.color] = (acc[h.color] || 0) + 1;
            return acc;
        }, {});
        colorsChart = new Chart(colorsCtx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(colorCounts).map(c => colorMap[c].name),
                datasets: [{
                    data: Object.values(colorCounts),
                    backgroundColor: Object.keys(colorCounts).map(c => colorMap[c].bg),
                    borderColor: Object.keys(colorCounts).map(c => colorMap[c].border),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Highlights by Color' }
                },
                onClick: (evt, elements) => {
                    if (elements.length > 0) {
                        const clickedColorName = colorsChart.data.labels[elements[0].index];
                        const clickedColor = Object.keys(colorMap).find(key => colorMap[key].name === clickedColorName);
                        if (activeColorFilter === clickedColor) {
                            colorFilter.value = 'all';
                            activeColorFilter = null;
                        } else {
                            colorFilter.value = clickedColor;
                            activeColorFilter = clickedColor;
                        }
                        filterAndSort();
                    }
                }
            }
        });

        // Timeline Chart
        const bookDates = getBookReadingDates(books, highlights);
        const timelineData = getTimelineData(highlights, bookDates, 'month');

        const bookCompletionLines = {
            id: 'bookCompletionLines',
            afterDraw: (chart) => {
                const ctx = chart.ctx;
                const xAxis = chart.scales.x;
                const yAxis = chart.scales.y;
                const currentFilter = document.querySelector('#timeline-filters button.active')?.dataset.filter || 'month';

                const completedBooks = allBooks.filter(b => b.percent_read >= 98);

                completedBooks.forEach(book => {
                    const date = new Date(book.date_last_read);
                    let key;

                    if (currentFilter === 'day') {
                        key = date.toISOString().split('T')[0];
                    } else if (currentFilter === 'week') {
                        const weekStart = new Date(date);
                        weekStart.setDate(date.getDate() - date.getDay());
                        key = weekStart.toISOString().split('T')[0];
                    } else {
                        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    }
                    
                    const index = chart.data.labels.indexOf(key);

                    if (index !== -1) {
                        const x = xAxis.getPixelForValue(index);
                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(x, yAxis.top);
                        ctx.lineTo(x, yAxis.bottom);
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = 'rgba(153, 102, 255, 0.8)';
                        ctx.stroke();

                        ctx.restore();
                    }
                });
            }
        };

        timelineChart = new Chart(timelineCtx, {
            type: 'bar',
            data: {
                labels: timelineData.labels,
                datasets: timelineData.datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                    },
                    y: {
                        stacked: true
                    }
                },
                plugins: {
                    legend: { display: true },
                    title: { display: true, text: 'Highlights Timeline' },
                    tooltip: {
                        enabled: false,
                        mode: 'index',
                        intersect: false,
                        external: (context) => {
                            // Tooltip Element
                            let tooltipEl = document.getElementById('chartjs-tooltip');

                            // Create element on first render
                            if (!tooltipEl) {
                                tooltipEl = document.createElement('div');
                                tooltipEl.id = 'chartjs-tooltip';
                                tooltipEl.innerHTML = '<table></table>';
                                document.body.appendChild(tooltipEl);
                            }

                            // Hide if no tooltip
                            const tooltipModel = context.tooltip;
                            if (tooltipModel.opacity === 0) {
                                tooltipEl.style.opacity = 0;
                                return;
                            }

                            // Set Text
                            if (tooltipModel.body) {
                                const titleLines = tooltipModel.title || [];
                                const bodyLines = tooltipModel.body.map(b => b.lines);

                                let innerHtml = '<thead>';

                                titleLines.forEach(function(title) {
                                    innerHtml += '<tr><th>' + title + '</th></tr>';
                                });
                                innerHtml += '</thead><tbody>';

                                bodyLines.forEach(function(body, i) {
                                    const colors = tooltipModel.labelColors[i];
                                    let style = 'background:' + colors.backgroundColor;
                                    style += '; border-color:' + colors.borderColor;
                                    style += '; border-width: 2px';
                                    const span = '<span style="' + style + '"></span>';
                                    innerHtml += '<tr><td>' + span + body + '</td></tr>';
                                });
                                
                                // Finished Books Section
                                const chart = context.chart;
                                const completedBooks = allBooks.filter(b => b.percent_read >= 98);
                                const currentFilter = document.querySelector('#timeline-filters button.active')?.dataset.filter || 'month';
                                const dataIndex = tooltipModel.dataPoints[0].dataIndex;
                                const label = chart.data.labels[dataIndex];
                                
                                const booksAtPosition = [];
                                if (label) {
                                    completedBooks.forEach(book => {
                                        const date = new Date(book.date_last_read);
                                        let key;
                                        if (currentFilter === 'day') {
                                            key = date.toISOString().split('T')[0];
                                        } else if (currentFilter === 'week') {
                                            const weekStart = new Date(date);
                                            weekStart.setDate(date.getDate() - date.getDay());
                                            key = weekStart.toISOString().split('T')[0];
                                        } else {
                                            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                                        }
                                        if (key === label) {
                                            booksAtPosition.push(book.title);
                                        }
                                    });
                                }

                                if (booksAtPosition.length > 0) {
                                    innerHtml += '<tr><td>&nbsp;</td></tr>'; // Spacer
                                    innerHtml += '<tr><th>Finished Books</th></tr>';
                                    booksAtPosition.forEach(title => {
                                        innerHtml += `<tr><td>${title}</td></tr>`;
                                    });
                                }

                                innerHtml += '</tbody>';

                                let tableRoot = tooltipEl.querySelector('table');
                                tableRoot.innerHTML = innerHtml;
                            }

                            const position = context.chart.canvas.getBoundingClientRect();

                            tooltipEl.style.opacity = 1;
                            tooltipEl.style.position = 'absolute';
                            tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
                            tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY + 'px';
                            tooltipEl.style.fontFamily = tooltipModel.options.bodyFont.family;
                            tooltipEl.style.fontSize = tooltipModel.options.bodyFont.size + 'px';
                            tooltipEl.style.fontStyle = tooltipModel.options.bodyFont.style;
                            tooltipEl.style.padding = tooltipModel.options.padding + 'px ' + tooltipModel.options.padding + 'px';
                            tooltipEl.style.pointerEvents = 'none';
                            tooltipEl.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                            tooltipEl.style.color = 'white';
                            tooltipEl.style.borderRadius = '3px';
                            tooltipEl.style.transition = 'opacity 0.2s';
                        }
                    }
                }
            },
            plugins: [bookCompletionLines]
        });

        document.getElementById('timeline-filters').addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                document.querySelectorAll('#timeline-filters button').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                filterAndSort();
            }
        });
    }

    function getBookReadingDates(books, highlights) {
        const bookDates = {};
        books.forEach(book => {
            if (book.percent_read >= 98) {
                const bookHighlights = highlights.filter(h => h.book_id === book.book_id);
                if (bookHighlights.length > 0) {
                    const firstHighlight = bookHighlights.reduce((earliest, current) => {
                        return new Date(current.date_created) < new Date(earliest.date_created) ? current : earliest;
                    });
                    bookDates[book.book_id] = {
                        start: new Date(firstHighlight.date_created),
                        end: new Date(book.date_last_read)
                    };
                }
            }
        });
        return bookDates;
    }

    function getTimelineData(highlights, bookDates, interval) {
        const datasets = {};
        const labels = new Set();
        const now = new Date();
        let startDate = new Date(0); // The beginning of time

        switch (interval) {
            case 'ytd':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            case '1y':
                startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
                break;
            case 'max':
                // startDate is already at the beginning of time
                break;
        }

        const filteredHighlights = highlights.filter(h => {
            const highlightDate = new Date(h.date_created);
            if (interval === 'ytd') {
                return highlightDate.getFullYear() === now.getFullYear();
            }
            return highlightDate >= startDate;
        });

        filteredHighlights.forEach(h => {
            const bookDateInfo = bookDates[h.book_id];
            if (bookDateInfo) {
                const date = new Date(h.date_created);
                let key;

                let groupingInterval = interval;
                if (['ytd', '1y', '5y', 'max'].includes(interval)) {
                    groupingInterval = 'month'; // Default to month for larger ranges
                }

                if (groupingInterval === 'day') {
                    key = date.toISOString().split('T')[0];
                } else if (groupingInterval === 'week') {
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    key = weekStart.toISOString().split('T')[0];
                } else { // month
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                }

                labels.add(key);
                const color = h.color;
                if (!datasets[color]) {
                    datasets[color] = {
                        label: colorMap[color].name,
                        data: {},
                        backgroundColor: colorMap[color].bg,
                        borderColor: colorMap[color].border,
                        borderWidth: 1
                    };
                }
                datasets[color].data[key] = (datasets[color].data[key] || 0) + 1;
            }
        });

        const sortedLabels = Array.from(labels).sort();
        const finalDatasets = Object.values(datasets).map(ds => {
            ds.data = sortedLabels.map(label => ds.data[label] || 0);
            return ds;
        });

        return {
            labels: sortedLabels,
            datasets: finalDatasets
        };
    }
    
    function updateCharts(highlights) {
        // Update Time Spent Chart
        const bookTime = highlights.reduce((acc, h) => {
            if (!acc[h.book_title]) {
                acc[h.book_title] = h.time_spent_reading || 0;
            }
            return acc;
        }, {});
        const sortedTime = Object.entries(bookTime).sort(([, a], [, b]) => b - a);
        timeSpentChart.data.labels = sortedTime.map(([title]) => title);
        timeSpentChart.data.datasets[0].data = sortedTime.map(([, time]) => (time / 3600).toFixed(2));
        timeSpentChart.update();

        // Update Book Chart
        const bookCounts = highlights.reduce((acc, h) => {
            acc[h.book_title] = (acc[h.book_title] || 0) + 1;
            return acc;
        }, {});
        const sortedBooks = Object.entries(bookCounts).sort(([, a], [, b]) => b - a);
        booksChart.data.labels = sortedBooks.map(([title]) => title);
        booksChart.data.datasets[0].data = sortedBooks.map(([, count]) => count);
        booksChart.update();

        // Update Color Chart
        const colorCounts = highlights.reduce((acc, h) => {
            acc[h.color] = (acc[h.color] || 0) + 1;
            return acc;
        }, {});
        colorsChart.data.labels = Object.keys(colorCounts).map(c => colorMap[c].name);
        colorsChart.data.datasets[0].data = Object.values(colorCounts);
        colorsChart.update();

        // Update Timeline Chart
        const bookDates = getBookReadingDates(allBooks, allHighlights);
        const currentTimelineFilter = document.querySelector('#timeline-filters button.active')?.dataset.filter || 'month';
        const timelineData = getTimelineData(highlights, bookDates, currentTimelineFilter);
        timelineChart.data.labels = timelineData.labels;
        timelineChart.data.datasets = timelineData.datasets;
        timelineChart.update();
    }

    function displayHighlights(highlights, searchTerm = '') {
        highlightsContainer.innerHTML = '';
        highlights.forEach(h => {
            const highlightEl = document.createElement('div');
            highlightEl.classList.add('highlight', `color-${h.color}`);

            const titleEl = document.createElement('div');
            titleEl.classList.add('book-title');
            titleEl.innerHTML = `<span>${h.book_title}</span>`;
            highlightEl.appendChild(titleEl);

            const text = document.createElement('p');
            if (searchTerm) {
                const regex = new RegExp(`(${searchTerm})`, 'gi');
                text.innerHTML = h.text.replace(regex, '<mark>$1</mark>');
            } else {
                text.textContent = h.text;
            }
            highlightEl.appendChild(text);

            if (h.annotation) {
                const annotation = document.createElement('p');
                annotation.classList.add('annotation');
                if (searchTerm) {
                    const regex = new RegExp(`(${searchTerm})`, 'gi');
                    annotation.innerHTML = h.annotation.replace(regex, '<mark>$1</mark>');
                } else {
                    annotation.textContent = h.annotation;
                }
                highlightEl.appendChild(annotation);
            }

            const date = document.createElement('p');
            date.classList.add('date');
            date.textContent = new Date(h.date_created).toLocaleString();
            highlightEl.appendChild(date);

            highlightsContainer.appendChild(highlightEl);
        });
    }

    function filterAndSort() {
        let filteredHighlights = [...allHighlights];

        // Filter by book
        const selectedBook = bookFilter.value;
        if (selectedBook !== 'all') {
            filteredHighlights = filteredHighlights.filter(h => h.book_title === selectedBook);
        }

        // Filter by type
        const selectedType = typeFilter.value;
        if (selectedType !== 'all') {
            filteredHighlights = filteredHighlights.filter(h => h.type === selectedType);
        }

        // Filter by color
        const selectedColor = colorFilter.value;
        if (selectedColor !== 'all') {
            filteredHighlights = filteredHighlights.filter(h => h.color == selectedColor);
        }

        // Search
        const searchTerm = searchInput.value.toLowerCase();
        if (searchTerm) {
            filteredHighlights = filteredHighlights.filter(h =>
                h.text.toLowerCase().includes(searchTerm) ||
                (h.annotation && h.annotation.toLowerCase().includes(searchTerm))
            );
        }

        // Sort
        const sortBy = sortFilter.value;
        if (sortBy === 'date_desc') {
            filteredHighlights.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
        } else if (sortBy === 'date_asc') {
            filteredHighlights.sort((a, b) => new Date(a.date_created) - new Date(b.date_created));
        } else if (sortBy === 'book_asc') {
            filteredHighlights.sort((a, b) => a.book_title.localeCompare(b.book_title));
        } else if (sortBy === 'random') {
            for (let i = filteredHighlights.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [filteredHighlights[i], filteredHighlights[j]] = [filteredHighlights[j], filteredHighlights[i]];
            }
        }

        displayHighlights(filteredHighlights, searchTerm);
        updateCharts(filteredHighlights);
    }

    bookFilter.addEventListener('change', () => {
        activeBookFilter = bookFilter.value;
        filterAndSort();
    });
    typeFilter.addEventListener('change', filterAndSort);
    colorFilter.addEventListener('change', () => {
        activeColorFilter = colorFilter.value;
        filterAndSort();
    });
    sortFilter.addEventListener('change', filterAndSort);
    searchInput.addEventListener('input', filterAndSort);
});
