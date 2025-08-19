import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
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

    renderProfile(profileData, isOwner);
}

function renderProfile(data, isOwner) {
    const descriptionHtml = data.description ? converter.makeHtml(data.description) : '<p>No description yet.</p>';

    profileSection.innerHTML = `
        <div id="profile-view">
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
                renderProfile(profileData, true); // Re-render with new data
                document.getElementById('profile-view').style.display = 'block';
                document.getElementById('profile-edit').style.display = 'none';
            }
        });
    }
}
