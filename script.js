import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { collection, getDocs, query, where, collectionGroup, limit, doc, getDoc, runTransaction, arrayUnion, arrayRemove, orderBy, startAfter } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";
import { loadProfile } from "./profile.js";
const provider = new GoogleAuthProvider();

document.addEventListener('DOMContentLoaded', async () => {
    await loadHeader();
    const highlightsContainer = document.getElementById('highlights-container');
    const bookFilter = document.getElementById('book-filter');
    const typeFilter = document.getElementById('type-filter');
    const colorFilter = document.getElementById('color-filter');
    const sortFilter = document.getElementById('sort-filter');
    const searchInput = document.getElementById('search-input');
    const userProfile = document.getElementById('user-profile');
    const modal = document.getElementById('highlight-focus-modal');
    const modalContent = document.getElementById('modal-highlight-content');
    const closeButton = document.querySelector('.close-button');
    const shareButton = document.getElementById('share-button');
    
    let allHighlights = [];
    let allBooks = [];
    let usersData = {};
    let booksChart, colorsChart, timeSpentChart, timelineChart;
    let activeBookFilter = null;
    let activeColorFilter = null;
    let isLoading = false;
    let allLandingHighlights = [];
    let landingHighlightsOffset = 0;

    const colorMap = {
        0: { name: 'Yellow', bg: 'rgba(255, 235, 59, 0.7)', border: 'rgba(255, 235, 59, 1)' },
        1: { name: 'Pink', bg: 'rgba(233, 30, 99, 0.7)', border: 'rgba(233, 30, 99, 1)' },
        2: { name: 'Blue', bg: 'rgba(33, 150, 243, 0.7)', border: 'rgba(33, 150, 243, 1)' },
        3: { name: 'Green', bg: 'rgba(76, 175, 80, 0.7)', border: 'rgba(76, 175, 80, 1)' },
    };

    // --- Routing ---
    const handleRouting = () => {
        const path = window.location.pathname;
        const landingPage = document.getElementById('landing-page');
        const mainContent = document.getElementById('main-content');
        const profileSection = document.getElementById('profile-section');

        if (path === '/' || path === '/index.html') {
            landingPage.style.display = 'block';
            mainContent.style.display = 'none';
            if (profileSection) profileSection.style.display = 'none';
        } else if (path.startsWith('/user/')) {
            landingPage.style.display = 'none';
            mainContent.style.display = 'block';
            if (profileSection) profileSection.style.display = 'block';
            const userId = path.split('/')[2];
            loadUserData(userId);
            loadProfile(userId);
        } else {
            landingPage.style.display = 'none';
            mainContent.style.display = 'block';
            if (profileSection) profileSection.style.display = 'none';
            loadAllPublicData();
        }
    };

    // --- Authentication Logic ---

    async function loadHeader() {
        try {
            const response = await fetch('/header.html');
            const headerHTML = await response.text();
            const headerElement = document.querySelector('header');
            if (headerElement) {
                headerElement.innerHTML = headerHTML;
            } else {
                // If no header exists, prepend it to the body
                document.body.insertAdjacentHTML('afterbegin', headerHTML);
            }
        } catch (error) {
            console.error('Error loading header:', error);
        }
    }

    const updateUI = async (user) => {
        const userProfileContainer = document.getElementById('user-profile');
        if (!userProfileContainer) return;
        userProfileContainer.innerHTML = ''; // Clear previous content

        if (user) {
            // User is signed in
            const userNameEl = document.createElement('a');
            userNameEl.href = `/user/${user.uid}`;
            userNameEl.id = 'user-name';
            
            // Fetch user's nickname from Firestore
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists() && userDocSnap.data().profile && userDocSnap.data().profile.nickname) {
                userNameEl.textContent = userDocSnap.data().profile.nickname;
            } else {
                userNameEl.textContent = user.displayName;
            }

            const uploadBtn = document.createElement('button');
            uploadBtn.id = 'upload-btn';
            uploadBtn.textContent = 'Upload Highlights';
            uploadBtn.addEventListener('click', () => window.location.href = '/upload.html');

            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logout-btn';
            logoutBtn.textContent = 'Logout';
            logoutBtn.addEventListener('click', () => signOut(auth));

            userProfileContainer.append(userNameEl, uploadBtn, logoutBtn);

        } else {
            // User is signed out
            const loginBtn = document.createElement('button');
            loginBtn.id = 'login-google-btn';
            loginBtn.textContent = 'Sign in with Google';
            loginBtn.addEventListener('click', () => {
                signInWithPopup(auth, provider).catch(error => {
                    console.error("Authentication failed:", error);
                    alert(error.message);
                });
            });
            userProfileContainer.appendChild(loginBtn);
        }
    };

    onAuthStateChanged(auth, user => {
        updateUI(user);
        handleRouting(); // Re-route after auth state changes
    });

    // Load data for the landing page when the DOM is ready.
    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
        loadLandingPageHighlights();
        loadSocialProof();
    }

    const landingUploadBtn = document.getElementById('landing-upload-btn');
    if (landingUploadBtn) {
        landingUploadBtn.addEventListener('click', () => {
            const user = auth.currentUser;
            if (user) {
                window.location.href = '/upload.html';
            } else {
                alert('Please sign in to upload your highlights.');
            }
        });
    }

    // --- Dark Mode ---
    const darkModeToggle = document.querySelector('.dark-mode-toggle');
    const imagotypeImg = document.getElementById('imagotype-img');
    const headerImagotypeImg = document.getElementById('header-imagotype-img');

    const updateImagotype = () => {
        const isDarkMode = document.body.classList.contains('dark-mode');
        if (imagotypeImg) {
            imagotypeImg.src = isDarkMode ? '/assets/ImagotypeWhite.svg' : '/assets/Imagotype.svg';
        }
        if (headerImagotypeImg) {
            headerImagotypeImg.src = isDarkMode ? '/assets/ImagotypeWhite.svg' : '/assets/Imagotype.svg';
        }
    };

    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDarkMode = document.body.classList.contains('dark-mode');
            localStorage.setItem('darkMode', isDarkMode);
            darkModeToggle.innerHTML = isDarkMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
            updateImagotype();
            // Re-render charts with the correct theme
            if (allHighlights.length > 0) {
                createCharts(allHighlights, allBooks);
            }
        });
    }

    // Check for saved dark mode preference
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        if (darkModeToggle) {
            darkModeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        }
    }

    // Initial imagotype check
    updateImagotype();


    async function getBookForHighlight(highlight) {
        const bookRef = doc(db, `users/${highlight.user_id}/books/${highlight.book_id}`);
        const bookSnap = await getDoc(bookRef);
        return bookSnap.exists() ? bookSnap.data() : null;
    }

    async function getUsersData(userIds) {
        const users = {};
        const userIdsToFetch = [...new Set(userIds)].filter(id => !usersData[id]);
    
        if (userIdsToFetch.length > 0) {
            const usersQuery = query(collection(db, 'users'), where('__name__', 'in', userIdsToFetch));
            const usersSnapshot = await getDocs(usersQuery);
            usersSnapshot.forEach(doc => {
                users[doc.id] = doc.data();
            });
        }
    
        // Merge new users into the global usersData object
        Object.assign(usersData, users);
        return usersData;
    }

    async function loadSocialProof() {
        try {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            const userCount = usersSnapshot.size;
            document.getElementById('user-count').textContent = userCount;

            // This is a simple way to count highlights. For large datasets, a counter in Firestore would be better.
            const highlightsSnapshot = await getDocs(collectionGroup(db, 'highlights'));
            const highlightCount = highlightsSnapshot.size;
            document.getElementById('highlight-count').textContent = highlightCount;

        } catch (error) {
            console.error("Error loading social proof data:", error);
        }
    }

    async function loadLandingPageHighlights() {
        if (isLoading) return;
        isLoading = true;
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) loadingIndicator.style.display = 'block';
    
        try {
            // Fetch highlights from all users to ensure diversity
            if (allLandingHighlights.length === 0) {
                const usersSnapshot = await getDocs(collection(db, 'users'));
                const userIds = usersSnapshot.docs.map(doc => doc.id);
    
                const highlightsPerUser = 10;
                const promises = userIds.map(userId => {
                    const userHighlightsQuery = query(
                        collection(db, `users/${userId}/highlights`),
                        limit(highlightsPerUser)
                    );
                    return getDocs(userHighlightsQuery);
                });
    
                const snapshots = await Promise.all(promises);
                let highlights = [];
                snapshots.forEach((snapshot, index) => {
                    const userId = userIds[index];
                    snapshot.forEach(doc => {
                        highlights.push({
                            highlight_id: doc.id,
                            user_id: userId,
                            ...doc.data()
                        });
                    });
                });
    
                // Shuffle the combined highlights
                for (let i = highlights.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [highlights[i], highlights[j]] = [highlights[j], highlights[i]];
                }
                
                allLandingHighlights = highlights;
            }
    
            // Paginated display
            const highlightsToDisplay = allLandingHighlights.slice(landingHighlightsOffset, landingHighlightsOffset + 12);
            landingHighlightsOffset += 12;
    
            const userIds = highlightsToDisplay.map(h => h.user_id);
            await getUsersData(userIds);
    
            const enrichedHighlights = await Promise.all(highlightsToDisplay.map(async h => {
                const book = await getBookForHighlight(h);
                const user = usersData[h.user_id];
                const nickname = user && user.profile ? user.profile.nickname : 'Anonymous';
                return { ...h, book_title: book ? book.title : 'Unknown Book', user_nickname: nickname };
            }));
    
            const trendingHighlightsContainer = document.getElementById('trending-highlights-container');
            if (!trendingHighlightsContainer.classList.contains('masonry')) {
                trendingHighlightsContainer.classList.add('masonry');
            }
            
            enrichedHighlights.forEach(h => {
                const highlightEl = createHighlightElement(h);
                trendingHighlightsContainer.appendChild(highlightEl);
            });
    
        } catch (error) {
            console.error("Error loading landing page highlights:", error);
        } finally {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            isLoading = false;
        }
    }

    window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500 && !isLoading) {
            if (landingHighlightsOffset < allLandingHighlights.length) {
                loadLandingPageHighlights();
            }
        }
    });

    async function loadUserData(userId) {
        try {
            const userBooksQuery = query(collection(db, "users", userId, "books"));
            const userHighlightsQuery = query(collection(db, "users", userId, "highlights"));

            const [booksSnapshot, highlightsSnapshot] = await Promise.all([
                getDocs(userBooksQuery),
                getDocs(userHighlightsQuery)
            ]);

            const books = booksSnapshot.docs.map(doc => ({ book_id: doc.id, ...doc.data() }));
            const highlights = highlightsSnapshot.docs.map(doc => ({ highlight_id: doc.id, user_id: userId, ...doc.data() }));

            const booksMap = new Map(books.map(book => [book.book_id, book]));

            allBooks = books;
            allHighlights = highlights.map(highlight => {
                const book = booksMap.get(highlight.book_id);
                return {
                    ...highlight,
                    ...book,
                    book_title: book ? book.title : 'Unknown Book'
                };
            });

            populateBookFilter(allBooks);
            createCharts(allHighlights, allBooks);
            filterAndSort();
            checkForUrlHighlight();

        } catch (error) {
            console.error("Error loading user data from Firestore:", error);
        }
    }

    async function loadAllPublicData() {
        try {
            const usersSnapshot = await getDocs(collection(db, "users"));
            let books = [];
            let highlights = [];

            for (const userDoc of usersSnapshot.docs) {
                const userBooksQuery = query(collection(db, "users", userDoc.id, "books"));
                const userHighlightsQuery = query(collection(db, "users", userDoc.id, "highlights"));

                const [booksSnapshot, highlightsSnapshot] = await Promise.all([
                    getDocs(userBooksQuery),
                    getDocs(userHighlightsQuery)
                ]);

                books = books.concat(booksSnapshot.docs.map(doc => ({ book_id: doc.id, ...doc.data() })));
                highlights = highlights.concat(highlightsSnapshot.docs.map(doc => ({ highlight_id: doc.id, user_id: userDoc.id, ...doc.data() })));
            }

            const booksMap = new Map(books.map(book => [book.book_id, book]));

            allBooks = books;
            allHighlights = highlights.map(highlight => {
                const book = booksMap.get(highlight.book_id);
                return {
                    ...highlight,
                    ...book,
                    book_title: book ? book.title : 'Unknown Book'
                };
            });

            populateBookFilter(allBooks);
            createCharts(allHighlights, allBooks);
            filterAndSort();
            checkForUrlHighlight();

        } catch (error) {
            console.error("Error loading data from Firestore:", error);
        }
    }

    function populateBookFilter(books) {
        bookFilter.innerHTML = '<option value="all">All Books</option>'; // Clear previous options
        books.sort((a, b) => a.title.localeCompare(b.title));
        books.forEach(book => {
            const option = document.createElement('option');
            option.value = book.title;
            option.textContent = book.title;
            bookFilter.appendChild(option);
        });
    }

    function createCharts(highlights, books) {
        if (booksChart) booksChart.destroy();
        if (colorsChart) colorsChart.destroy();
        if (timeSpentChart) timeSpentChart.destroy();
        if (timelineChart) timelineChart.destroy();

        const isDarkMode = document.body.classList.contains('dark-mode');
        const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const textColor = isDarkMode ? '#e0e0e0' : '#333';

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
        const totalTime = sortedTime.reduce((sum, [, time]) => sum + time, 0);
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
                    title: { 
                        display: true, 
                        text: `Time Spent Reading (Total: ${(totalTime / 3600).toFixed(2)} hours)`,
                        color: textColor 
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                },
                onClick: (evt, elements) => {
                    if (elements.length > 0) {
                        const clickedBook = timeSpentChart.data.labels[elements[0].index];
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

        // Book Chart
        const bookCounts = highlights.reduce((acc, h) => {
            acc[h.book_title] = (acc[h.book_title] || 0) + 1;
            return acc;
        }, {});
        const sortedBooks = Object.entries(bookCounts).sort(([, a], [, b]) => b - a);
        const totalHighlights = sortedBooks.reduce((sum, [, count]) => sum + count, 0);
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
                    title: { 
                        display: true, 
                        text: `Highlights by Book (Total: ${totalHighlights})`,
                        color: textColor
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
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
                    legend: { 
                        position: 'top',
                        labels: { color: textColor }
                    },
                    title: { 
                        display: true, 
                        text: 'Highlights by Color',
                        color: textColor
                    }
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
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y: {
                        stacked: true,
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                },
                plugins: {
                    legend: { 
                        display: true,
                        labels: { color: textColor }
                    },
                    title: { 
                        display: true, 
                        text: 'Highlights Timeline',
                        color: textColor
                    },
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
        const totalTime = sortedTime.reduce((sum, [, time]) => sum + time, 0);
        timeSpentChart.data.labels = sortedTime.map(([title]) => title);
        timeSpentChart.data.datasets[0].data = sortedTime.map(([, time]) => (time / 3600).toFixed(2));
        timeSpentChart.options.plugins.title.text = `Time Spent Reading (Total: ${(totalTime / 3600).toFixed(2)} hours)`;
        timeSpentChart.update();

        // Update Book Chart
        const bookCounts = highlights.reduce((acc, h) => {
            acc[h.book_title] = (acc[h.book_title] || 0) + 1;
            return acc;
        }, {});
        const sortedBooks = Object.entries(bookCounts).sort(([, a], [, b]) => b - a);
        const totalHighlights = sortedBooks.reduce((sum, [, count]) => sum + count, 0);
        booksChart.data.labels = sortedBooks.map(([title]) => title);
        booksChart.data.datasets[0].data = sortedBooks.map(([, count]) => count);
        booksChart.options.plugins.title.text = `Highlights by Book (Total: ${totalHighlights})`;
        booksChart.update();

        // Update Color Chart
        const colorCounts = highlights.reduce((acc, h) => {
            acc[h.color] = (acc[h.color] || 0) + 1;
            return acc;
        }, {});
        const colorKeys = Object.keys(colorCounts);
        colorsChart.data.labels = colorKeys.map(c => colorMap[c].name);
        colorsChart.data.datasets[0].data = Object.values(colorCounts);
        colorsChart.data.datasets[0].backgroundColor = colorKeys.map(c => colorMap[c].bg);
        colorsChart.data.datasets[0].borderColor = colorKeys.map(c => colorMap[c].border);
        colorsChart.update();

        // Update Timeline Chart
        const bookDates = getBookReadingDates(allBooks, allHighlights);
        const currentTimelineFilter = document.querySelector('#timeline-filters button.active')?.dataset.filter || 'month';
        const timelineData = getTimelineData(highlights, bookDates, currentTimelineFilter);
        timelineChart.data.labels = timelineData.labels;
        timelineChart.data.datasets = timelineData.datasets;
        timelineChart.update();
    }

function createHighlightElement(h, searchTerm = '') {
        const highlightEl = document.createElement('div');
        highlightEl.classList.add('highlight', `color-${h.color}`);
        highlightEl.dataset.highlightId = h.highlight_id;

        const titleEl = document.createElement('div');
        titleEl.classList.add('book-title');
        titleEl.innerHTML = `<span>${h.book_title}</span>`;
        
        const shareIcon = document.createElement('i');
        shareIcon.classList.add('fas', 'fa-share-alt', 'share-icon');
        shareIcon.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent opening the modal
            shareHighlight(h.highlight_id);
        });

        titleEl.appendChild(shareIcon);
        highlightEl.appendChild(titleEl);

        const controlsEl = document.createElement('div');
        controlsEl.classList.add('highlight-controls');

        const likeButton = document.createElement('button');
        likeButton.classList.add('like-btn');
        const likeIcon = document.createElement('i');
        likeIcon.classList.add('fas', 'fa-heart');
        likeButton.appendChild(likeIcon);

        const likeCount = document.createElement('span');
        likeCount.classList.add('like-count');
        likeCount.textContent = h.likeCount || 0;
        likeButton.appendChild(likeCount);

        const currentUser = auth.currentUser;
        if (currentUser && h.likes && h.likes.includes(currentUser.uid)) {
            likeButton.classList.add('liked');
        }

        likeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLike(h.highlight_id, h.user_id);
        });

        controlsEl.appendChild(likeButton);

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

        const footerEl = document.createElement('div');
        footerEl.classList.add('highlight-footer');

        footerEl.appendChild(controlsEl);

        const rightFooter = document.createElement('div');
        rightFooter.classList.add('right-footer');

        if (h.user_nickname) {
            const sharedByEl = document.createElement('div');
            sharedByEl.classList.add('shared-by');
            
            const userLink = document.createElement('a');
            userLink.href = `/user/${h.user_id}`;
            userLink.textContent = h.user_nickname;
            
            sharedByEl.append('Shared by: ', userLink);
            rightFooter.appendChild(sharedByEl);
        }

        const date = document.createElement('p');
        date.classList.add('date');
        date.textContent = new Date(h.date_created).toLocaleString();
        rightFooter.appendChild(date);

        footerEl.appendChild(rightFooter);

        highlightEl.appendChild(footerEl);

        highlightEl.addEventListener('click', () => openFocusModal(h));
        return highlightEl;
    }

async function toggleLike(highlightId, authorId) {
        const user = auth.currentUser;
        if (!user) {
            alert("You must be logged in to like a highlight.");
            return;
        }

        const highlightRef = doc(db, `users/${authorId}/highlights/${highlightId}`);
        const likeButton = document.querySelector(`.highlight[data-highlight-id="${highlightId}"] .like-btn`);
        const likeCountSpan = document.querySelector(`.highlight[data-highlight-id="${highlightId}"] .like-count`);

        try {
            await runTransaction(db, async (transaction) => {
                const highlightDoc = await transaction.get(highlightRef);
                if (!highlightDoc.exists()) {
                    throw "Document does not exist!";
                }

                const data = highlightDoc.data();
                const likes = data.likes || [];
                const likeCount = data.likeCount || 0;
                const userIndex = likes.indexOf(user.uid);

                if (userIndex === -1) {
                    // Like the highlight
                    transaction.update(highlightRef, {
                        likes: arrayUnion(user.uid),
                        likeCount: likeCount + 1
                    });
                    if (likeButton) likeButton.classList.add('liked');
                    if (likeCountSpan) likeCountSpan.textContent = likeCount + 1;
                } else {
                    // Unlike the highlight
                    transaction.update(highlightRef, {
                        likes: arrayRemove(user.uid),
                        likeCount: likeCount - 1
                    });
                    if (likeButton) likeButton.classList.remove('liked');
                    if (likeCountSpan) likeCountSpan.textContent = likeCount - 1;
                }
            });
        } catch (error) {
            console.error("Like transaction failed: ", error);
        }
    }

    function displayHighlights(highlights, searchTerm = '') {
        highlightsContainer.innerHTML = '';
        highlightsContainer.classList.add('masonry'); // Apply masonry layout
        highlights.forEach(h => {
            const highlightEl = createHighlightElement(h, searchTerm);
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
        } else if (sortBy === 'likes_desc') {
            filteredHighlights.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
        } else if (sortBy === 'random') {
            for (let i = filteredHighlights.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [filteredHighlights[i], filteredHighlights[j]] = [filteredHighlights[j], filteredHighlights[i]];
            }
        }

        displayHighlights(filteredHighlights, searchTerm);
        updateCharts(filteredHighlights);
    }

    if (bookFilter) {
        bookFilter.addEventListener('change', () => {
            activeBookFilter = bookFilter.value;
            filterAndSort();
        });
    }
    if (typeFilter) {
        typeFilter.addEventListener('change', filterAndSort);
    }
    if (colorFilter) {
        colorFilter.addEventListener('change', () => {
            activeColorFilter = colorFilter.value;
            filterAndSort();
        });
    }
    if (sortFilter) {
        sortFilter.addEventListener('change', filterAndSort);
    }
    if (searchInput) {
        searchInput.addEventListener('input', filterAndSort);
    }

    // --- Modal Logic ---

    function openFocusModal(highlight) {
        modalContent.innerHTML = ''; // Clear previous content
        
        // Recreate the highlight structure inside the modal
        const highlightEl = document.createElement('div');
        highlightEl.classList.add('highlight', `color-${highlight.color}`);

        const titleEl = document.createElement('div');
        titleEl.classList.add('book-title');
        titleEl.innerHTML = `<span>${highlight.book_title}</span>`;
        highlightEl.appendChild(titleEl);

        const text = document.createElement('p');
        text.textContent = highlight.text;
        highlightEl.appendChild(text);

        if (highlight.annotation) {
            const annotation = document.createElement('p');
            annotation.classList.add('annotation');
            annotation.textContent = highlight.annotation;
            highlightEl.appendChild(annotation);
        }

        const date = document.createElement('p');
        date.classList.add('date');
        date.textContent = new Date(highlight.date_created).toLocaleString();
        highlightEl.appendChild(date);

        modalContent.appendChild(highlightEl);
        modal.style.display = 'flex';

        // Update URL
        const url = new URL(window.location);
        url.searchParams.set('highlight', highlight.highlight_id);
        window.history.pushState({ highlightId: highlight.highlight_id }, '', url);

        // Store current highlight for sharing
        shareButton.dataset.highlightId = highlight.highlight_id;
    }

    function closeFocusModal() {
        modal.style.display = 'none';
        // Update URL
        const url = new URL(window.location);
        url.searchParams.delete('highlight');
        window.history.pushState({}, '', url);
    }

    async function shareHighlight(highlightId) {
        let highlight = allHighlights.find(h => h.highlight_id === highlightId);
        if (!highlight) {
            highlight = allLandingHighlights.find(h => h.highlight_id === highlightId);
        }

        if (!highlight || !highlight.user_id) {
            console.error("Could not find highlight or user_id for sharing");
            return;
        }

        const shareUrl = new URL(`/user/${highlight.user_id}`, window.location.origin);
        shareUrl.searchParams.set('highlight', highlightId);

        const shareData = {
            title: `Highlight from ${highlight.book_title}`,
            text: `"${highlight.text}"`,
            url: shareUrl.href,
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                // Fallback for browsers that don't support Web Share API
                await navigator.clipboard.writeText(shareUrl.href);
                alert('Link copied to clipboard!');
            }
        } catch (err) {
            console.error('Error sharing:', err);
            // Fallback if sharing fails
            await navigator.clipboard.writeText(shareUrl.href);
            alert('Sharing failed. Link copied to clipboard!');
        }
    }

    function checkForUrlHighlight() {
        const params = new URLSearchParams(window.location.search);
        const highlightId = params.get('highlight');
        if (highlightId && allHighlights.length > 0) {
            const highlight = allHighlights.find(h => h.highlight_id === highlightId);
            if (highlight) {
                // Use a small timeout to ensure the UI is ready
                setTimeout(() => {
                    openFocusModal(highlight);
                }, 100);
            }
        }
    }

    closeButton.addEventListener('click', closeFocusModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) { // Clicked on the background
            closeFocusModal();
        }
    });
    shareButton.addEventListener('click', () => {
        if (shareButton.dataset.highlightId) {
            shareHighlight(shareButton.dataset.highlightId);
        }
    });

    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.highlightId) {
            const highlight = allHighlights.find(h => h.highlight_id === event.state.highlightId);
            if (highlight) {
                openFocusModal(highlight);
            }
        } else {
            closeFocusModal();
        }
    });

    // Make functions globally available
    window.createHighlightElement = createHighlightElement;
    window.toggleLike = toggleLike;
});
