// ============================================================
// FEELSHARE — Dashboard Logic (dashboard.js)
// ============================================================

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, addDoc, collection, query, where, getDocs,
  onSnapshot, updateDoc, arrayUnion, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================================
// STATE
// ============================================================
let currentUser     = null;
let currentUserData = null;
let linkedUsers     = [];
let selectedEmotion = null;
let selectedSecret  = null;

// ============================================================
// UTILITIES
// ============================================================
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-msg">${msg}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

function getPinValue(attr) {
  return Array.from(document.querySelectorAll(`[${attr}]`)).map(i => i.value).join('');
}

function clearPinInputs(attr) {
  document.querySelectorAll(`[${attr}]`).forEach(i => { i.value = ''; i.classList.remove('filled'); });
}

function hashPin(pin) {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) { hash = ((hash << 5) - hash) + pin.charCodeAt(i); hash |= 0; }
  return hash.toString();
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
window.closeModal = closeModal;

function timeAgo(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff  = Math.floor((Date.now() - date) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

const EMOTION_COLORS = {
  Happiness:'#F5A623', Sadness:'#5B8DEF', Anger:'#E53935',
  Fear:'#7B61FF', Surprise:'#00BCD4', Disgust:'#66BB6A',
  Trust:'#FF7043', Anticipation:'#AB47BC', Secret:'#455A64'
};

// ============================================================
// SETUP PIN INPUTS
// ============================================================
function setupPinInputs(attr) {
  const inputs = document.querySelectorAll(`[${attr}]`);
  inputs.forEach((input, i) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g,'');
      if (input.value && i < inputs.length - 1) inputs[i+1].focus();
      input.classList.toggle('filled', !!input.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) inputs[i-1].focus();
    });
  });
}
setupPinInputs('data-emotion-pin');
setupPinInputs('data-secret-pin');

// ============================================================
// AUTH GUARD — FIXED
// Root cause: sessionStorage.getItem('pinVerified') was being
// checked the instant onAuthStateChanged fires. For Google login,
// the browser navigates to dashboard.html while the popup is still
// resolving — so pinVerified isn't written yet when the guard runs.
// Fix: poll for up to 1.5s before giving up and signing out.
// ============================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // Check pinVerified — poll briefly to handle navigation timing
  let pinVerified = sessionStorage.getItem('pinVerified') === 'true';
  if (!pinVerified) {
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (sessionStorage.getItem('pinVerified') === 'true') {
        pinVerified = true;
        break;
      }
    }
  }

  if (!pinVerified) {
    await signOut(auth);
    window.location.href = 'login.html';
    return;
  }

  currentUser = user;
  await loadUserData();
  await loadLinkedAccounts();
  listenNotifications();
  listenSentFeed();
  listenReceivedFeed();
});

// ============================================================
// LOAD USER DATA
// ============================================================
async function loadUserData() {
  const snap = await getDoc(doc(db, 'users', currentUser.uid));
  if (!snap.exists()) {
    sessionStorage.removeItem('pinVerified');
    await signOut(auth);
    window.location.href = 'login.html';
    return;
  }
  currentUserData = snap.data();

  const hour = new Date().getHours();
  let greet = 'Good morning';
  if (hour >= 12 && hour < 18) greet = 'Good afternoon';
  if (hour >= 18)              greet = 'Good evening';
  document.getElementById('greetingText').textContent    = `${greet}, ${currentUserData.firstName}! 👋`;
  document.getElementById('greetingSubtext').textContent = `Logged in as @${currentUserData.username}`;

  const avatarBtn = document.getElementById('profileAvatarBtn');
  if (currentUserData.profilePicUrl) {
    avatarBtn.innerHTML = `<img src="${currentUserData.profilePicUrl}" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
  } else {
    document.getElementById('avatarInitial').textContent = currentUserData.firstName.charAt(0).toUpperCase();
  }
}

// ============================================================
// LOAD LINKED ACCOUNTS
// ============================================================
async function loadLinkedAccounts() {
  if (!currentUserData?.linkedAccounts?.length) {
    renderLinkedChips([]);
    return;
  }
  const linked = [];
  for (const uid of currentUserData.linkedAccounts) {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) linked.push(snap.data());
  }
  linkedUsers = linked;
  renderLinkedChips(linked);
  populateRecipientDropdowns();
  document.getElementById('linkedCount').textContent = `${linked.length} connected`;
}

function renderLinkedChips(linked) {
  const container = document.getElementById('linkedAccountsContainer');
  if (!linked.length) {
    container.innerHTML = `
      <div class="empty-linked">
        <i class="fa-solid fa-user-plus" style="font-size:1.5rem;margin-bottom:0.5rem;display:block;"></i>
        Wala ka pang linked account.<br><small>I-click ang "Link Account" para mag-connect.</small>
      </div>`;
    return;
  }
  container.innerHTML = linked.map(u => `
    <div class="linked-chip">
      <div class="chip-avatar">
        ${u.profilePicUrl
          ? `<img src="${u.profilePicUrl}" alt="${u.firstName}" />`
          : u.firstName.charAt(0).toUpperCase()}
      </div>
      ${u.firstName} ${u.lastName}
    </div>
  `).join('');
}

function populateRecipientDropdowns() {
  const options = linkedUsers.map(u =>
    `<option value="${u.uid}">${u.firstName} ${u.lastName} (@${u.username})</option>`
  ).join('');
  document.getElementById('emotionRecipient').innerHTML =
    `<option value="">Piliin ang linked person...</option>${options}`;
  document.getElementById('secretRecipient').innerHTML =
    `<option value="">Piliin ang linked person...</option>${options}`;
}

// ============================================================
// NOTIFICATIONS
// ============================================================
function listenNotifications() {
  const q = query(
    collection(db, 'notifications'),
    where('toUid', '==', currentUser.uid),
    where('read', '==', false)
  );
  onSnapshot(q, (snap) => {
    const count = snap.size;
    const badge = document.getElementById('notifBadge');
    if (count > 0) { badge.textContent = count; badge.classList.remove('d-none'); }
    else           { badge.classList.add('d-none'); }
    renderNotifications(snap.docs);
  });
}

function renderNotifications(docs) {
  const list = document.getElementById('notifList');
  if (!docs.length) { list.innerHTML = '<div class="notif-empty">No notifications yet.</div>'; return; }
  list.innerHTML = docs.map(d => {
    const n = d.data();
    return `
      <div class="notif-item unread" data-id="${d.id}">
        <span class="notif-dot"></span>
        <span class="notif-item-icon">${n.type === 'link_request' ? '🔗' : n.type === 'emotion' ? '💌' : '🔒'}</span>
        <div class="notif-item-body">
          <div class="notif-item-title">${n.title}</div>
          <div class="notif-item-sub">${n.body}</div>
          ${n.type === 'link_request' ? `
            <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
              <button class="btn btn-primary btn-sm" onclick="acceptLinkRequest('${d.id}','${n.fromUid}')">Accept</button>
              <button class="btn btn-outline btn-sm" onclick="declineLinkRequest('${d.id}')">Decline</button>
            </div>` : ''}
        </div>
      </div>`;
  }).join('');
}

document.getElementById('notifBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('notifPanel').classList.toggle('open');
});
document.getElementById('closeNotifPanel').addEventListener('click', () => {
  document.getElementById('notifPanel').classList.remove('open');
});
document.getElementById('markAllRead').addEventListener('click', async () => {
  const q = query(collection(db, 'notifications'), where('toUid','==',currentUser.uid), where('read','==',false));
  const snap = await getDocs(q);
  for (const d of snap.docs) await updateDoc(d.ref, { read: true });
});

// ============================================================
// ACCEPT / DECLINE LINK REQUEST
// ============================================================
window.acceptLinkRequest = async (notifId, fromUid) => {
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), { linkedAccounts: arrayUnion(fromUid) });
    await updateDoc(doc(db, 'users', fromUid), { linkedAccounts: arrayUnion(currentUser.uid) });
    await updateDoc(doc(db, 'notifications', notifId), { read: true });
    await addDoc(collection(db, 'notifications'), {
      toUid: fromUid, fromUid: currentUser.uid,
      type: 'link_accepted',
      title: '🔗 Link Accepted!',
      body: `${currentUserData.firstName} ${currentUserData.lastName} (@${currentUserData.username}) accepted your link request.`,
      read: false, createdAt: serverTimestamp()
    });
    showToast('Link accepted! Magkakonektado na kayo.', 'success');
    await loadLinkedAccounts();
  } catch (err) {
    showToast('Error accepting request.', 'error');
  }
};

window.declineLinkRequest = async (notifId) => {
  await updateDoc(doc(db, 'notifications', notifId), { read: true });
  showToast('Link request declined.', 'info');
};

// ============================================================
// LINK ACCOUNT MODAL
// ============================================================
document.getElementById('linkAccountBtn').addEventListener('click', () => openModal('linkModal'));

let foundUserData = null;
let linkSearched  = false;

document.getElementById('searchUserBtn').addEventListener('click', async () => {
  const btn = document.getElementById('searchUserBtn');
  if (!linkSearched) {
    const username = document.getElementById('linkTargetUsername').value.trim().toLowerCase();
    if (!username) return showToast('Ilagay ang username.', 'error');
    if (username === currentUserData.username) return showToast('Hindi mo ma-link ang sarili mo.', 'error');

    const q    = query(collection(db, 'users'), where('username','==',username));
    const snap = await getDocs(q);
    if (snap.empty) return showToast('User not found.', 'error');

    foundUserData = snap.docs[0].data();
    if (currentUserData.linkedAccounts?.includes(foundUserData.uid)) {
      return showToast('Naka-link ka na sa taong ito.', 'warning');
    }

    document.getElementById('linkPreviewAvatar').textContent = foundUserData.firstName.charAt(0).toUpperCase();
    document.getElementById('linkPreviewName').textContent   = `${foundUserData.firstName} ${foundUserData.lastName}`;
    document.getElementById('linkPreviewUser').textContent   = `@${foundUserData.username}`;
    document.getElementById('linkTargetPreview').style.display = 'flex';
    btn.textContent = 'Send Link Request';
    linkSearched = true;
  } else {
    if (!foundUserData) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        toUid: foundUserData.uid, fromUid: currentUser.uid,
        type: 'link_request',
        title: '🔗 Link Request',
        body: `${currentUserData.firstName} ${currentUserData.lastName} (@${currentUserData.username}) wants to link with you.`,
        read: false, createdAt: serverTimestamp()
      });
      showToast('Link request sent!', 'success');
      closeModal('linkModal');
      document.getElementById('linkTargetUsername').value = '';
      document.getElementById('linkTargetPreview').style.display = 'none';
      btn.textContent = 'Search User';
      linkSearched = false;
      foundUserData = null;
    } catch (err) {
      showToast('Failed to send request.', 'error');
    }
  }
});

// ============================================================
// VIEW LINKED PEOPLE
// ============================================================
document.getElementById('viewLinkedBtn').addEventListener('click', () => {
  const list = document.getElementById('linkedPeopleList');
  if (!linkedUsers.length) {
    list.innerHTML = '<div class="notif-empty">Wala ka pang linked na tao.</div>';
  } else {
    list.innerHTML = linkedUsers.map(u => `
      <div class="notif-item">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;font-size:1rem;">
          ${u.profilePicUrl ? `<img src="${u.profilePicUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : u.firstName.charAt(0)}
        </div>
        <div class="notif-item-body">
          <div class="notif-item-title">${u.firstName} ${u.lastName}</div>
          <div class="notif-item-sub">@${u.username}</div>
        </div>
      </div>`).join('');
  }
  openModal('linkedPeopleModal');
});

// ============================================================
// EMOTION BUTTONS
// ============================================================
document.querySelectorAll('.emotion-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const emotion = btn.dataset.emotion;
    const emoji   = btn.dataset.emoji;

    if (emotion === 'Secret') {
      openModal('secretModal');
      return;
    }
    if (!linkedUsers.length) {
      return showToast('Mag-link muna ng account bago mag-send ng feelings.', 'warning');
    }

    selectedEmotion = emotion;
    const color = EMOTION_COLORS[emotion] || '#7C6FF7';
    document.getElementById('emotionModalTitle').textContent = `Send: ${emoji} ${emotion}`;
    document.getElementById('emotionModalHeader').innerHTML  = `
      <div style="font-size:2rem;">${emoji}</div>
      <div>
        <div style="font-weight:700;color:${color};font-size:1rem;">${emotion}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);">Ipaliwanag kung bakit ka nakakaramdam nito.</div>
      </div>`;
    document.getElementById('emotionModalHeader').style.background = `${color}18`;
    document.getElementById('emotionModalHeader').style.border = `1px solid ${color}44`;
    document.getElementById('emotionMessage').value = '';
    clearPinInputs('data-emotion-pin');
    openModal('emotionModal');
  });
});

// ============================================================
// SEND EMOTION
// ============================================================
document.getElementById('sendEmotionBtn').addEventListener('click', async () => {
  const message      = document.getElementById('emotionMessage').value.trim();
  const recipientUid = document.getElementById('emotionRecipient').value;
  const pin          = getPinValue('data-emotion-pin');

  if (!message)       return showToast('Isulat ang iyong nararamdaman.', 'error');
  if (!recipientUid)  return showToast('Piliin kung sino ang padadalhan.', 'error');
  if (pin.length < 4) return showToast('Ilagay ang iyong PIN.', 'error');
  if (hashPin(pin) !== currentUserData.pin) {
    clearPinInputs('data-emotion-pin');
    return showToast('Mali ang PIN. Subukan ulit.', 'error');
  }

  const btn = document.getElementById('sendEmotionBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending...';

  try {
    const recipient = linkedUsers.find(u => u.uid === recipientUid);
    await addDoc(collection(db, 'messages'), {
      fromUid: currentUser.uid, toUid: recipientUid,
      fromName: `${currentUserData.firstName} ${currentUserData.lastName}`,
      fromUsername: currentUserData.username,
      emotion: selectedEmotion,
      emoji: document.querySelector(`.emotion-btn[data-emotion="${selectedEmotion}"]`)?.dataset.emoji || '💬',
      message, isSecret: false, createdAt: serverTimestamp()
    });
    await addDoc(collection(db, 'notifications'), {
      toUid: recipientUid, fromUid: currentUser.uid,
      type: 'emotion',
      title: `💌 New feeling from ${currentUserData.firstName}`,
      body: `${currentUserData.firstName} is feeling ${selectedEmotion}: "${message.substring(0,60)}..."`,
      read: false, createdAt: serverTimestamp()
    });
    showToast(`Feeling sent to ${recipient?.firstName}! 💌`, 'success');
    closeModal('emotionModal');
  } catch (err) {
    showToast('Failed to send. Try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send';
  }
});

// ============================================================
// SECRET MODAL
// ============================================================
document.querySelectorAll('.secret-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.secret-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    selectedSecret = opt.dataset.secret;
  });
});

document.getElementById('sendSecretBtn').addEventListener('click', async () => {
  if (!selectedSecret) return showToast('Piliin ang uri ng mensahe.', 'error');

  const message      = document.getElementById('secretMessage').value.trim();
  const recipientUid = document.getElementById('secretRecipient').value;
  const pin          = getPinValue('data-secret-pin');

  if (!recipientUid)  return showToast('Piliin kung sino ang padadalhan.', 'error');
  if (pin.length < 4) return showToast('Ilagay ang iyong PIN.', 'error');
  if (hashPin(pin) !== currentUserData.pin) {
    clearPinInputs('data-secret-pin');
    return showToast('Mali ang PIN. Subukan ulit.', 'error');
  }

  const btn = document.getElementById('sendSecretBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending...';

  try {
    const recipient = linkedUsers.find(u => u.uid === recipientUid);
    await addDoc(collection(db, 'messages'), {
      fromUid: currentUser.uid, toUid: recipientUid,
      fromName: `${currentUserData.firstName} ${currentUserData.lastName}`,
      fromUsername: currentUserData.username,
      emotion: `Secret: ${selectedSecret}`, emoji: '🔒',
      message: message || '(walang karagdagang mensahe)',
      isSecret: true, secretType: selectedSecret, createdAt: serverTimestamp()
    });
    await addDoc(collection(db, 'notifications'), {
      toUid: recipientUid, fromUid: currentUser.uid,
      type: 'secret',
      title: `🔒 Secret message from ${currentUserData.firstName}`,
      body: `${currentUserData.firstName} sent you a serious matter: ${selectedSecret}.`,
      read: false, createdAt: serverTimestamp()
    });
    showToast(`Secret sent securely to ${recipient?.firstName}. 🔒`, 'success');
    closeModal('secretModal');
    selectedSecret = null;
    document.querySelectorAll('.secret-option').forEach(o => o.classList.remove('selected'));
    document.getElementById('secretMessage').value = '';
  } catch (err) {
    showToast('Failed to send. Try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Securely';
  }
});

// ============================================================
// FEEDS
// ============================================================
function listenSentFeed() {
  const q = query(
    collection(db, 'messages'),
    where('fromUid','==', currentUser.uid),
    orderBy('createdAt','desc')
  );
  onSnapshot(q, (snap) => {
    const feed = document.getElementById('sentFeed');
    if (snap.empty) {
      feed.innerHTML = '<div class="empty-linked" style="text-align:center;padding:1.5rem;"><small>Wala ka pang naipadala.</small></div>';
      return;
    }
    feed.innerHTML = snap.docs.slice(0,10).map(d => {
      const m = d.data();
      const color = EMOTION_COLORS[m.emotion] || EMOTION_COLORS[m.emotion?.split(':')[1]?.trim()] || '#455A64';
      return `
        <div class="feed-item">
          <div class="feed-emotion-dot" style="background:${color};"></div>
          <div class="feed-item-body">
            <div class="feed-item-top">
              <span class="feed-item-emotion" style="color:${color};">${m.emoji || '💬'} ${m.emotion}</span>
              <span class="feed-item-time">${timeAgo(m.createdAt)}</span>
            </div>
            <div class="feed-item-msg">${m.message}</div>
            <div class="feed-item-footer">To: @${linkedUsers.find(u=>u.uid===m.toUid)?.username || 'someone'}</div>
          </div>
        </div>`;
    }).join('');
  });
}

function listenReceivedFeed() {
  const q = query(
    collection(db, 'messages'),
    where('toUid','==', currentUser.uid),
    orderBy('createdAt','desc')
  );
  onSnapshot(q, (snap) => {
    const feed = document.getElementById('receivedFeed');
    if (snap.empty) {
      feed.innerHTML = '<div class="empty-linked" style="text-align:center;padding:1.5rem;"><small>Wala ka pang natanggap.</small></div>';
      return;
    }
    feed.innerHTML = snap.docs.slice(0,10).map(d => {
      const m = d.data();
      const color = EMOTION_COLORS[m.emotion] || '#455A64';
      return `
        <div class="feed-item" ${m.isSecret ? 'style="border-left:3px solid #455A64;"' : ''}>
          <div class="feed-emotion-dot" style="background:${color};"></div>
          <div class="feed-item-body">
            <div class="feed-item-top">
              <span class="feed-item-emotion" style="color:${color};">${m.emoji || '💬'} ${m.emotion}</span>
              <span class="feed-item-time">${timeAgo(m.createdAt)}</span>
            </div>
            <div class="feed-item-msg">${m.message}</div>
            <div class="feed-item-footer">From: @${m.fromUsername}</div>
          </div>
        </div>`;
    }).join('');
  });
}

// ============================================================
// PROFILE REDIRECT
// ============================================================
document.getElementById('profileAvatarBtn').addEventListener('click', () => {
  window.location.href = 'profile.html';
});

// ============================================================
// LOGOUT
// ============================================================
document.getElementById('logoutBtn').addEventListener('click', async () => {
  sessionStorage.removeItem('pinVerified');
  await signOut(auth);
  window.location.href = 'login.html';
});