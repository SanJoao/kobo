import { doc, getDoc, setDoc, collectionGroup, query, where, getDocs, collection } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

const profileSection = document.getElementById('profile-section');
const converter = new showdown.Converter();
const MAX_DESC_LENGTH = 1000;

export async function loadProfile(userId) {
    if (!profileSection) return;

    const user = auth.currentUser;
    const isOwner = user && user.uid === userId;

    const profileDocRef = doc(db, "users", userId);
    const profileSnap = await getDoc(profileDocRef);
    const profileData = profileSnap.exists() ? profileSnap.data().profile || {} : {};

    // Store the userId on the element to ensure it's available to event listeners
    profileSection.dataset.userId = userId;

    renderProfile(profileData, isOwner);
}

function renderProfile(data, isOwner) {
    const descriptionHtml = data.description ? converter.makeHtml(data.description) : '<p>No description yet.</p>';

    profileSection.innerHTML = `
        <div class="profile-tabs">
            <button class="tab-link active" data-tab="profile-view">Profile</button>
            <button class="tab-link" data-tab="liked-highlights">Liked Highlights</button>
        </div>
        <div id="profile-view" class="tab-content active">
            <h2 id="profile-nickname">${data.nickname || 'Anonymous'}</h2>
            <div id="profile-description">${descriptionHtml}</div>
            <div id="profile-social">
                ${data.twitter ? `<a href="${data.twitter}" target="_blank"><i class="fab fa-twitter"></i></a>` : ''}
                ${data.github ? `<a href="${data.github}" target="_blank"><i class="fab fa-github"></i></a>` : ''}
                ${data.website ? `<a href="${data.website}" target="_blank"><i class="fas fa-globe"></i></a>` : ''}
                ${data.facebook ? `<a href="${data.facebook}" target="_blank"><i class="fab fa-facebook"></i></a>` : ''}
                ${data.instagram ? `<a href="${data.instagram}" target="_blank"><i class="fab fa-instagram"></i></a>` : ''}
                ${data.linkedin ? `<a href="${data.linkedin}" target="_blank"><i class="fab fa-linkedin"></i></a>` : ''}
                ${data.reddit ? `<a href="${data.reddit}" target="_blank"><i class="fab fa-reddit"></i></a>` : ''}
                ${data.tiktok ? `<a href="${data.tiktok}" target="_blank"><i class="fab fa-tiktok"></i></a>` : ''}
                ${data.youtube ? `<a href="${data.youtube}" target="_blank"><i class="fab fa-youtube"></i></a>` : ''}
            </div>
            ${isOwner ? '<button id="edit-profile-btn">Edit Profile</button>' : ''}
        </div>
        <div id="liked-highlights" class="tab-content">
            <h3>Liked Highlights</h3>
            <div id="liked-highlights-container"></div>
        </div>
        <div id="profile-edit" style="display: none;">
            <form id="profile-form">
                <label for="nickname">Nickname:</label>
                <input type="text" id="nickname" name="nickname" value="${data.nickname || ''}">

                <label for="description">Description:</label>
                <textarea id="description" name="description" maxlength="${MAX_DESC_LENGTH}">${data.description || ''}</textarea>
                <div id="char-counter">${(data.description || '').length}/${MAX_DESC_LENGTH}</div>

                <h3>Social Networks</h3>
                <label for="twitter">Twitter:</label>
                <input type="url" id="twitter" name="twitter" placeholder="https://twitter.com/username" value="${data.twitter || ''}">

                <label for="github">GitHub:</label>
                <input type="url" id="github" name="github" placeholder="https://github.com/username" value="${data.github || ''}">

                <label for="website">Website:</label>
                <input type="url" id="website" name="website" placeholder="https://example.com" value="${data.website || ''}">

                <label for="facebook">Facebook:</label>
                <input type="url" id="facebook" name="facebook" placeholder="https://facebook.com/username" value="${data.facebook || ''}">

                <label for="instagram">Instagram:</label>
                <input type="url" id="instagram" name="instagram" placeholder="https://instagram.com/username" value="${data.instagram || ''}">

                <label for="linkedin">LinkedIn:</label>
                <input type="url" id="linkedin" name="linkedin" placeholder="https://linkedin.com/in/username" value="${data.linkedin || ''}">

                <label for="reddit">Reddit:</label>
                <input type="url" id="reddit" name="reddit" placeholder="https://reddit.com/user/username" value="${data.reddit || ''}">

                <label for="tiktok">TikTok:</label>
                <input type="url" id="tiktok" name="tiktok" placeholder="https://tiktok.com/@username" value="${data.tiktok || ''}">

                <label for="youtube">YouTube:</label>
                <input type="url" id="youtube" name="youtube" placeholder="https://youtube.com/c/username" value="${data.youtube || ''}">

                <button type="submit">Save Profile</button>
                <button type="button" id="cancel-edit-btn">Cancel</button>
            </form>
        </div>
    `;

    if (isOwner) {
        const editBtn = document.getElementById('edit-profile-btn');
        const cancelBtn = document.getElementById('cancel-edit-btn');
        const profileView = document.getElementById('profile-view');
        const profileEdit = document.getElementById('profile-edit');
        const descriptionTextarea = document.getElementById('description');
        const charCounter = document.getElementById('char-counter');

        editBtn.addEventListener('click', () => {
            profileView.style.display = 'none';
            profileEdit.style.display = 'block';
        });

        cancelBtn.addEventListener('click', () => {
            profileView.style.display = 'block';
            profileEdit.style.display = 'none';
        });

        descriptionTextarea.addEventListener('input', () => {
            const count = descriptionTextarea.value.length;
            charCounter.textContent = `${count}/${MAX_DESC_LENGTH}`;
        });

        document.getElementById('profile-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const profileData = {
                nickname: formData.get('nickname'),
                description: formData.get('description'),
                twitter: formData.get('twitter'),
                github: formData.get('github'),
                website: formData.get('website'),
                facebook: formData.get('facebook'),
                instagram: formData.get('instagram'),
                linkedin: formData.get('linkedin'),
                reddit: formData.get('reddit'),
                tiktok: formData.get('tiktok'),
                youtube: formData.get('youtube'),
            };

            const user = auth.currentUser;
            if (user) {
                const profileDocRef = doc(db, "users", user.uid);
                await setDoc(profileDocRef, { profile: profileData }, { merge: true });
                profileSection.dataset.userId = user.uid; // Update the dataset
                renderProfile(profileData, true); // Re-render with new data
                document.getElementById('profile-view').style.display = 'block';
                document.getElementById('profile-edit').style.display = 'none';
            }
        });
    }

    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.dataset.tab;

            tabLinks.forEach(l => l.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            link.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            const dashboard = document.getElementById('dashboard');
            const filters = document.querySelector('.filters');
            const highlightsContainer = document.getElementById('highlights-container');

            if (tabId === 'liked-highlights') {
                const userId = profileSection.dataset.userId;
                if (userId) {
                    loadLikedHighlights(userId);
                } else {
                    console.error("User ID not found for loading liked highlights.");
                }
                // Ocultar dashboard y filtros
                if (dashboard) dashboard.style.display = 'none';
                if (filters) filters.style.display = 'none';
                if (highlightsContainer) highlightsContainer.style.display = 'none';
            } else {
                // Mostrar dashboard y filtros para otras pestañas
                if (dashboard) dashboard.style.display = 'flex';
                if (filters) filters.style.display = 'flex';
                if (highlightsContainer) highlightsContainer.style.display = 'grid';
            }
        });
    });
}

async function loadLikedHighlights(userId) {
    const container = document.getElementById('liked-highlights-container');
    if (!container) return;
    container.innerHTML = '<p>Loading liked highlights...</p>';

    try {
        const highlightsQuery = query(collectionGroup(db, 'highlights'), where('likes', 'array-contains', userId));
        const snapshot = await getDocs(highlightsQuery);

        if (snapshot.empty) {
            container.innerHTML = '<p>No liked highlights yet.</p>';
            return;
        }

        container.innerHTML = '';
        let highlights = snapshot.docs.map(doc => ({
            highlight_id: doc.id,
            user_id: doc.ref.parent.parent.id,
            ...doc.data()
        }));

        // Obtener datos de los usuarios para los apodos
        const userIds = [...new Set(highlights.map(h => h.user_id))];
        const usersData = await getUsersData(userIds);

        highlights = await Promise.all(highlights.map(async h => {
            const user = usersData[h.user_id];
            const nickname = user && user.profile ? user.profile.nickname : 'Anonymous';
            // Asegurarse de que book_title esté presente
            if (!h.book_title) {
                const bookRef = doc(db, `users/${h.user_id}/books/${h.book_id}`);
                const bookSnap = await getDoc(bookRef);
                h.book_title = bookSnap.exists() ? bookSnap.data().title : 'Unknown Book';
            }
            return { ...h, user_nickname: nickname };
        }));

        for (const h of highlights) {
            const highlightEl = window.createHighlightElement(h);
            container.appendChild(highlightEl);
        }
    } catch (error) {
        console.error("Error loading liked highlights:", error);
        container.innerHTML = '<p>Error loading liked highlights.</p>';
    }
}

async function getUsersData(userIds) {
    const users = {};
    const userIdsToFetch = [...new Set(userIds)];

    if (userIdsToFetch.length > 0) {
        const usersQuery = query(collection(db, 'users'), where('__name__', 'in', userIdsToFetch));
        const usersSnapshot = await getDocs(usersQuery);
        usersSnapshot.forEach(doc => {
            users[doc.id] = doc.data();
        });
    }
    return users;
}
